import { Context } from "hono";
import { query, type PermissionMode, type AuthType, type PermissionResult } from "@qwen-code/sdk";
import type { ChatRequest, StreamResponse } from "../../shared/types.ts";
import { logger } from "../utils/logger.ts";
import { checkLoop, type LoopState } from "../utils/loopDetector.ts";
import { bridgeSession } from "../utils/sessionBridge.ts";
import type { PendingPermission } from "./permission.ts";
import type { ServerResponse } from "node:http";

/** Track number of concurrent chat requests for diagnostics */
let _activeChatCount = 0;

/**
 * Maps sessionId → requestId for active streaming requests.
 * Prevents concurrent CLI processes for the same session, which causes
 * API call conflicts and premature stream termination (issue #123).
 */
const activeSessions = new Map<string, string>();

/** 24-hour timeout for user-facing operations (permission prompts, control requests) */
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1_000;

/**
 * Keepalive heartbeat interval. Frontend stall detector triggers after 120s
 * of silence, so 8 missed heartbeats (8 × 15s) = stall detected.
 */
const KEEPALIVE_INTERVAL_MS = 15_000;

/**
 * Safety timeout for canUseTool permission prompts.
 *
 * The CLI (qwen-code-cli) has a hardcoded 30-second default for outgoing
 * control requests (baseController.DEFAULT_REQUEST_TIMEOUT_MS). In
 * approval-mode "default" the CLI sends a can_use_tool request and waits
 * for the SDK to respond; if the user doesn't act within 30 s the CLI
 * emits "Control request timeout" and cancels the tool.
 *
 * We cannot change the CLI, so the frontend shows a countdown and
 * auto-approves the first option before the deadline. The backend also
 * keeps a fallback auto-approve timer (slightly later) in case the
 * frontend can't respond (e.g. tab in background).
 *
 * @see https://github.com/ivycomputing/qwen-code-webui/issues/139
 */
const CLI_CONTROL_REQUEST_TIMEOUT_MS = 30_000;
/** Frontend countdown duration — auto-approves at this point. */
const AUTO_APPROVE_MS = CLI_CONTROL_REQUEST_TIMEOUT_MS - 5_000; // 25 s
/** Backend fallback — fires a few seconds after frontend should have acted. */
const SAFETY_AUTO_APPROVE_MS = CLI_CONTROL_REQUEST_TIMEOUT_MS - 2_000; // 28 s

/**
 * Maps UI permission mode to Qwen SDK permission mode
 * Qwen SDK uses 'auto-edit' instead of 'acceptEdits'
 */
function mapPermissionMode(mode?: string): PermissionMode | undefined {
  if (!mode) return undefined;
  if (mode === "acceptEdits") {
    return "auto-edit";
  }
  // All other modes (default, plan, auto-edit, yolo) are passed through
  return mode as PermissionMode;
}

/**
 * Read-only tools that are safe to auto-approve within a single request after
 * the user approves them once. High-risk tools (write_file, edit, run_shell_command)
 * always require per-call confirmation for safety.
 *
 * Tool names use snake_case to match the SDK's canUseTool callback format.
 * See qwen-code-cli/packages/core/src/tools/tool-names.ts for the canonical list.
 */
// Tools that are safe to auto-approve without user confirmation.
// Criteria: no side effects, no writes to filesystem or external systems.
// Update this set when new read-only SDK tools are added.
const READ_ONLY_TOOLS = new Set(["read_file", "glob", "grep_search", "list_directory", "web_fetch", "think"]);

// Tools that should be auto-approved without a permission dialog because the
// WebUI cannot provide the interactive response the tool expects. The tool
// executes with default/empty input and the AI adjusts its follow-up.
const AUTO_APPROVE_NO_DIALOG_TOOLS = new Set(["ask_user_question"]);

function extractBaseCommand(command: string): string {
  return command.trim().split(/\s+/)[0] || "";
}

/**
 * Executes a Qwen command and sends StreamResponse objects via the provided enqueue callback.
 * Supports canUseTool callback for proactive permission handling.
 */
async function executeQwenCommand(
  message: string,
  requestId: string,
  requestAbortControllers: Map<string, AbortController>,
  pendingPermissions: Map<string, PendingPermission>,
  enqueue: (response: StreamResponse) => boolean,
  cliPath: string,
  sessionId?: string,
  allowedTools?: string[],
  workingDirectory?: string,
  permissionMode?: string,
  model?: string,
  authType?: AuthType,
): Promise<void> {
  let abortController: AbortController;
  const localPendingIds = new Set<string>();
  // Read-only tools approved by the user during this request — auto-approved on
  // subsequent calls within the same streaming session. Scope is limited to a
  // single executeQwenCommand invocation; the Set is discarded on request end.
  //
  // This is independent of the frontend's `allowedTools` (ChatRequest.allowedTools →
  // SDK allowedTools option), which persists across requests and handles the legacy
  // reactive permission flow. When a tool is in SDK `allowedTools`, the `canUseTool`
  // callback is not invoked at all, so the two mechanisms never conflict.
  const localAllowedTools = new Set<string>();

  const startTime = Date.now();
  let firstMessageLatencyMs: number | null = null;
  let messageCount = 0;

  try {
    // Process commands that start with '/'
    let processedMessage = message;
    if (message.startsWith("/")) {
      processedMessage = message.substring(1);
    }

    // Create and store AbortController for this request
    abortController = new AbortController();
    requestAbortControllers.set(requestId, abortController);

    // Log permission mode for debugging
    const mappedPermissionMode = permissionMode ? mapPermissionMode(permissionMode) : undefined;
    logger.chat.debug(
      "Executing Qwen query with permissionMode: {permissionMode} (mapped: {mappedPermissionMode})",
      { permissionMode, mappedPermissionMode },
    );

    _activeChatCount++;
    logger.chat.info(
      "[DIAG] Chat request START requestId={requestId} activeCount={activeCount} "
      + "concurrentRequests={concurrentRequests} pendingPermissions={pendingPermissions}",
      {
        requestId,
        activeCount: _activeChatCount,
        concurrentRequests: requestAbortControllers.size,
        pendingPermissions: pendingPermissions.size,
      },
    );

    const loopState: LoopState = { errorCount: 0, lastFingerprint: "", firstErrorTime: 0 };

    // Per-agent loop states keyed by parent_tool_use_id (#140).
    // Each fork agent gets its own LoopState so parallel agents don't
    // accumulate toward the same counter.
    const agentLoopStates = new Map<string, LoopState>();

    // Create the canUseTool callback — proactive permission handling
    const canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      _options: { signal: AbortSignal; suggestions?: unknown[] | null },
    ): Promise<PermissionResult> => {
      // Defense 1: check main query abort (not SDK's per-request signal)
      if (abortController.signal.aborted) {
        return { behavior: "deny", message: "Request aborted" };
      }

      // Read-only tools never require confirmation — skip the dialog entirely.
      if (READ_ONLY_TOOLS.has(toolName)) {
        logger.chat.debug("canUseTool: auto-approving read-only tool {toolName}", { toolName });
        return { behavior: "allow", updatedInput: input };
      }

      // Tools that the WebUI cannot interactively respond to — auto-approve
      // so the tool executes with defaults. The UnifiedMessageProcessor still
      // intercepts the tool_use to display questions as a chat message.
      if (AUTO_APPROVE_NO_DIALOG_TOOLS.has(toolName)) {
        logger.chat.debug("canUseTool: auto-approving tool without dialog {toolName}", { toolName });
        return { behavior: "allow", updatedInput: input };
      }

      // Auto-approve write tools the user already allowed during this request.
      if (localAllowedTools.has(toolName)) {
        logger.chat.debug("canUseTool: auto-approving previously allowed tool {toolName}", { toolName });
        return { behavior: "allow", updatedInput: input };
      }

      // For run_shell_command, also check command-specific entries.
      if (toolName === "run_shell_command" && input?.command && typeof input.command === "string") {
        const baseCmd = extractBaseCommand(input.command as string);
        if (baseCmd && localAllowedTools.has(`${toolName}:${baseCmd}`)) {
          logger.chat.debug("canUseTool: auto-approving previously allowed command {toolName}:{baseCmd}", { toolName, baseCmd });
          return { behavior: "allow", updatedInput: input };
        }
      }

      // Defense: auto-approve tools in the session's allowedTools — the persistent set
      // of tools the user has approved in Settings (unlike localAllowedTools which only
      // tracks approvals within the current streaming request).
      // The SDK should handle this before calling canUseTool, but this provides
      // defense-in-depth in case the SDK's internal matching has edge cases.
      if (allowedTools && allowedTools.length > 0) {
        const toolMatches = allowedTools.some(pattern => {
          if (pattern === toolName) return true;
          const openParen = pattern.indexOf('(');
          if (openParen !== -1) {
            const patternToolName = pattern.substring(0, openParen);
            if (patternToolName !== toolName) return false;
            const inner = pattern.substring(openParen + 1, pattern.length - 1);
            const cmdPrefix = inner.replace(/:.*$/, '');
            const actualCmd = String(input?.command || '').trim();
            return actualCmd === cmdPrefix || actualCmd.startsWith(cmdPrefix + ' ');
          }
          return false;
        });
        if (toolMatches) {
          logger.chat.debug("canUseTool: auto-approving tool in session allowedTools: {toolName}", { toolName });
          return { behavior: "allow", updatedInput: input };
        }
        logger.chat.debug(
          "canUseTool: allowedTools did not match toolName={toolName}, allowedTools={allowedTools}",
          { toolName, allowedTools },
        );
      }

      const permissionId = crypto.randomUUID();
      localPendingIds.add(permissionId);

      // Defense 2: enqueue returns false → stream already closed
      const suggestions = _options.suggestions
        ? (_options.suggestions as Array<{ type: string; label: string; description?: string }>).map((s) => ({
            type: s.type,
            label: s.label,
            description: s.description,
          }))
        : undefined;

      if (
        !enqueue({
          type: "permission_request",
          permissionId,
          toolName,
          toolInput: input,
          suggestions,
          autoApproveMs: AUTO_APPROVE_MS,
        })
      ) {
        localPendingIds.delete(permissionId);
        return { behavior: "deny", message: "Stream closed" };
      }

      logger.chat.debug("canUseTool: waiting for user response, permissionId={permissionId}, tool={toolName}", {
        permissionId,
        toolName,
      });

      // Defense 3: abort listener for async abort during wait
      //
      // The frontend shows a 25 s countdown and auto-approves. A backend
      // fallback timer at 28 s auto-approves if the frontend can't (e.g. tab
      // in background). Either way the CLI receives a response before its
      // 30 s control-request timeout.  See issue #139.
      return new Promise((resolve) => {
        let settled = false;
        const safeResolve = (result: PermissionResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        const safetyTimer = setTimeout(() => {
          pendingPermissions.delete(permissionId);
          localPendingIds.delete(permissionId);
          // Remember the approval so subsequent calls for the same tool auto-approve
          localAllowedTools.add(toolName);
          safeResolve({ behavior: "allow", updatedInput: input });
        }, SAFETY_AUTO_APPROVE_MS);

        const onAbort = () => {
          clearTimeout(safetyTimer);
          pendingPermissions.delete(permissionId);
          localPendingIds.delete(permissionId);
          safeResolve({ behavior: "deny", message: "Request aborted" });
        };
        abortController.signal.addEventListener("abort", onAbort, { once: true });

        pendingPermissions.set(permissionId, {
          resolve: (result, scope) => {
            clearTimeout(safetyTimer);
            abortController.signal.removeEventListener("abort", onAbort);
            localPendingIds.delete(permissionId);
            if (result.behavior === "allow") {
              if (scope === "specific" && toolName === "run_shell_command" && input?.command && typeof input.command === "string") {
                const baseCmd = extractBaseCommand(input.command as string);
                if (baseCmd) localAllowedTools.add(`${toolName}:${baseCmd}`);
              } else {
                localAllowedTools.add(toolName);
              }
            }
            safeResolve(result);
          },
          abortSignal: abortController.signal,
        });
      });
    };

    for await (const sdkMessage of query({
      prompt: processedMessage,
      options: {
        abortController,
        pathToQwenExecutable: cliPath,
        ...(sessionId ? { resume: sessionId } : {}),
        ...(allowedTools ? { allowedTools } : {}),
        ...(workingDirectory ? { cwd: workingDirectory } : {}),
        ...(mappedPermissionMode ? { permissionMode: mappedPermissionMode } : {}),
        ...(model ? { model } : {}),
        ...(authType ? { authType } : {}),
        stderr: (message: string) => {
          logger.chat.info("CLI stderr: {message}", { message });
        },
        canUseTool,
        timeout: { canUseTool: SESSION_TIMEOUT_MS, controlRequest: SESSION_TIMEOUT_MS },
      },
    })) {
      messageCount++;
      if (firstMessageLatencyMs === null) {
        firstMessageLatencyMs = Date.now() - startTime;
        logger.chat.info(
          "[DIAG] First SDK message received requestId={requestId} latencyMs={latencyMs}",
          { requestId, latencyMs: firstMessageLatencyMs },
        );
      }

      // Backend loop detection — failsafe if frontend detection fails.
      // Each agent (main session or fork) maintains its own LoopState
      // so parallel fork agents don't accumulate toward the same counter (#140).
      const rawForkId = (sdkMessage as Record<string, unknown>).parent_tool_use_id;
      const forkId = typeof rawForkId === "string" ? rawForkId : undefined;
      const ls = forkId
        ? (agentLoopStates.get(forkId) ?? { errorCount: 0, lastFingerprint: "", firstErrorTime: 0 })
        : loopState;
      if (forkId && !agentLoopStates.has(forkId)) {
        agentLoopStates.set(forkId, ls);
      }
      const loopResult = checkLoop(sdkMessage, ls);
      if (loopResult) {
        logger.chat.error(
          "Loop detected: fingerprint={fingerprint}, count={count}, aborting CLI",
          { fingerprint: loopResult.fingerprint, count: loopResult.count },
        );
        abortController.abort();
        const errorMessage = loopResult.fingerprint === "input_closed"
          ? "CLI session ended unexpectedly. Please send a new message."
          : `Auto-aborted: loop detected (${loopResult.fingerprint}, ${loopResult.count}x)`;
        if (!enqueue({
          type: "error",
          error: errorMessage,
        })) break;
        break;
      }

      logger.chat.debug("Qwen SDK Message: {sdkMessage}", { sdkMessage });

      if (!enqueue({
        type: "claude_json",
        data: sdkMessage,
      })) break;
    }

    if (!enqueue({ type: "done" })) return;

    logger.chat.info(
      "[DIAG] Chat request COMPLETE requestId={requestId} durationMs={durationMs} "
      + "messageCount={messageCount} firstLatencyMs={firstLatencyMs}",
      {
        requestId,
        durationMs: Date.now() - startTime,
        messageCount,
        firstLatencyMs: firstMessageLatencyMs,
      },
    );
  } catch (error) {
    logger.chat.error(
      "[DIAG] Chat request ERROR requestId={requestId} durationMs={durationMs} "
      + "messageCount={messageCount} error={error}",
      {
        requestId,
        durationMs: Date.now() - startTime,
        messageCount,
        error,
      },
    );
    enqueue({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    enqueue({ type: "done" });
  } finally {
    _activeChatCount--;
    // Ensure CLI subprocess is killed on any exit path (issue #84)
    const ac = requestAbortControllers.get(requestId);
    if (ac) {
      ac.abort();
      requestAbortControllers.delete(requestId);
    }
    // Clean up session mapping so a new request can start for this session
    if (sessionId && activeSessions.get(sessionId) === requestId) {
      activeSessions.delete(sessionId);
    }

    logger.chat.info(
      "[DIAG] Chat request FINALLY requestId={requestId} durationMs={durationMs} "
      + "activeCount={activeCount} concurrentRequests={concurrentRequests}",
      {
        requestId,
        durationMs: Date.now() - startTime,
        activeCount: _activeChatCount,
        concurrentRequests: requestAbortControllers.size,
      },
    );
    // Audit log: record which tools were auto-approved during this request
    if (localAllowedTools.size > 0) {
      logger.chat.debug("Request {requestId} auto-approved tools: {tools}", {
        requestId,
        tools: [...localAllowedTools],
      });
    }
    // Clean up unresolved pending permissions for this request
    for (const id of localPendingIds) {
      const pending = pendingPermissions.get(id);
      if (pending) {
        pending.resolve({ behavior: "deny", message: "Request ended" });
        pendingPermissions.delete(id);
      }
    }
  }
}

/**
 * Handles POST /api/chat requests with streaming responses
 */
export async function handleChatRequest(
  c: Context,
  requestAbortControllers: Map<string, AbortController>,
  pendingPermissions: Map<string, PendingPermission>,
) {
  const chatRequest: ChatRequest = await c.req.json();
  const { cliPath, authType } = c.var.config as { cliPath: string; authType?: AuthType };
  const outgoing = (c.env as { outgoing?: ServerResponse })?.outgoing;

  logger.chat.debug(
    "Received chat request {*}",
    chatRequest as unknown as Record<string, unknown>,
  );
  logger.chat.debug(
    "Chat request allowedTools: count={count} tools={allowedTools} permissionMode={permissionMode}",
    {
      count: chatRequest.allowedTools?.length ?? 0,
      allowedTools: chatRequest.allowedTools ?? [],
      permissionMode: chatRequest.permissionMode,
    },
  );

  logger.chat.info(
    "[DIAG] handleChatRequest ENTRY requestId={requestId} "
    + "concurrentRequests={concurrentRequests} pendingPermissions={pendingPermissions}",
    {
      requestId: chatRequest.requestId,
      concurrentRequests: requestAbortControllers.size,
      pendingPermissions: pendingPermissions.size,
    },
  );

  // Abort any existing request for the same session to prevent concurrent CLI
  // processes from conflicting (issue #123). This can happen when the frontend
  // stream closes prematurely and the user sends a new message before the old
  // CLI subprocess is fully terminated.
  if (chatRequest.sessionId) {
    const existingRequestId = activeSessions.get(chatRequest.sessionId);
    if (existingRequestId) {
      const existingAc = requestAbortControllers.get(existingRequestId);
      if (existingAc && !existingAc.signal.aborted) {
        logger.chat.warn(
          "[DIAG] Aborting existing request for session sessionId={sessionId} "
          + "oldRequestId={oldRequestId} newRequestId={newRequestId}",
          {
            sessionId: chatRequest.sessionId,
            oldRequestId: existingRequestId,
            newRequestId: chatRequest.requestId,
          },
        );
        existingAc.abort();
        requestAbortControllers.delete(existingRequestId);
        // Resolve any pending permissions from the old request immediately
        // rather than waiting for its finally block, so the new request's
        // permission prompts don't collide with stale ones.
        for (const [permissionId, pending] of pendingPermissions) {
          if (pending.abortSignal === existingAc.signal) {
            pending.resolve({ behavior: "deny", message: "Request superseded by new session request" });
            pendingPermissions.delete(permissionId);
          }
        }
      }
      activeSessions.delete(chatRequest.sessionId);
    }
    activeSessions.set(chatRequest.sessionId, chatRequest.requestId);
  }

  // Bridge session from Claude Code directory if not found in qwen directory.
  // This allows resuming Claude Code sessions that were loaded from history.
  const bridgedSessionId = await bridgeSession(
    chatRequest.workingDirectory,
    chatRequest.sessionId,
  );
  if (bridgedSessionId !== chatRequest.sessionId) {
    logger.chat.info(
      "Session bridged: original={originalSessionId} effective={effectiveSessionId}",
      { originalSessionId: chatRequest.sessionId, effectiveSessionId: bridgedSessionId },
    );
    // Intentionally mutate request to update sessionId for downstream use
    chatRequest.sessionId = bridgedSessionId ?? undefined;
  }

  const encoder = new TextEncoder();

  let keepaliveId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      // Ensure small keepalive chunks are flushed immediately (fixes stall
      // detector false positives caused by TCP/HTTP buffering of single-byte \n)
      if (outgoing?.socket) {
        outgoing.socket.setNoDelay(true);
      }

      const enqueue = (response: StreamResponse): boolean => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(response) + "\n"));
          return true;
        } catch {
          return false;
        }
      };

      // Send keepalive heartbeat to prevent browser timeout (ERR_INCOMPLETE_CHUNKED_ENCODING)
      // and stall detector false positives.
      //
      // CRITICAL: Write directly to the ServerResponse (`outgoing`) instead of
      // controller.enqueue(). The @hono/node-server stream consumer reads from
      // the ReadableStream asynchronously via reader.read() → writable.write().
      // When the Node.js event loop is busy with SDK processing, the consumer's
      // reader.read() promise may not resolve promptly, causing enqueued heartbeats
      // to sit in the stream's internal queue unread. Direct ServerResponse.write()
      // bypasses this buffering and hits the TCP socket immediately (setNoDelay is
      // already enabled). Node.js ServerResponse transparently applies chunked
      // encoding framing to each write(), so this is safe alongside the stream
      // consumer's writes — they never overlap because JS is single-threaded.
      keepaliveId = setInterval(() => {
        try {
          const heartbeat = encoder.encode('{"type":"heartbeat"}\n');
          if (outgoing && !outgoing.writableEnded && !outgoing.destroyed) {
            outgoing.write(heartbeat);
            logger.chat.debug("[KEEPALIVE] Heartbeat sent directly to socket");
          } else {
            // Fallback: outgoing not available (e.g. tests) — use stream enqueue
            controller.enqueue(heartbeat);
          }
        } catch { clearInterval(keepaliveId); }
      }, KEEPALIVE_INTERVAL_MS);

      try {
        await executeQwenCommand(
          chatRequest.message,
          chatRequest.requestId,
          requestAbortControllers,
          pendingPermissions,
          enqueue,
          cliPath,
          chatRequest.sessionId,
          chatRequest.allowedTools,
          chatRequest.workingDirectory,
          chatRequest.permissionMode,
          chatRequest.model,
          authType,
        );
        clearInterval(keepaliveId);
        controller.close();
      } catch (error) {
        clearInterval(keepaliveId);
        const errorResponse: StreamResponse = {
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        };
        enqueue(errorResponse);
        enqueue({ type: "done" });
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      clearInterval(keepaliveId);
      // Client disconnected — kill CLI subprocess to prevent infinite retry loops
      const ac = requestAbortControllers.get(chatRequest.requestId);
      if (ac) {
        logger.chat.info(
          "[DIAG] Client DISCONNECTED requestId={requestId} activeCount={activeCount} "
          + "concurrentRequests={concurrentRequests}",
          {
            requestId: chatRequest.requestId,
            activeCount: _activeChatCount,
            concurrentRequests: requestAbortControllers.size,
          },
        );
        ac.abort();

        // Log diagnostic 3s after cancel. The SDK's transport.close() sends
        // SIGTERM, then SIGKILL after 5s. Log unconditionally to capture
        // cases where the subprocess outlives the abort signal cleanup.
        const diagRequestId = chatRequest.requestId;
        const checkId = setTimeout(() => {
          logger.chat.warn(
            "[DIAG] Post-cancel check requestId={requestId} activeCount={activeCount} "
            + "concurrentRequests={concurrentRequests}",
            {
              requestId: diagRequestId,
              activeCount: _activeChatCount,
              concurrentRequests: requestAbortControllers.size,
            },
          );
        }, 3_000);
        if (checkId.unref) checkId.unref();
      }
      // Clean up session mapping
      if (chatRequest.sessionId && activeSessions.get(chatRequest.sessionId) === chatRequest.requestId) {
        activeSessions.delete(chatRequest.sessionId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      // Explicit chunked encoding prevents @hono/node-server from buffering the response
      "Transfer-Encoding": "chunked",
    },
  });
}
