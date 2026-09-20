import { Context } from "hono";
import type { PermissionMode, AuthType, PermissionResult } from "@qwen-code/sdk";
import type { ChatRequest, StreamResponse } from "../../shared/types.ts";
import { logger } from "../utils/logger.ts";
import { checkLoop, isFatalFingerprint, type LoopState } from "../utils/loopDetector.ts";
import { bridgeSession } from "../utils/sessionBridge.ts";
import {
  finalizeTrackedCliRequest,
  registerTrackedCliRequest,
  runWithTrackedCliRequest,
  signalTrackedCliAbort,
  updateTrackedCliSessionId,
} from "../utils/cliProcessRegistry.ts";
import { loadQwenQuery } from "../utils/qwenSdk.ts";
import { getProxyBaseUrl, isProxyRunning } from "../utils/llmProxy.ts";
import { getEnv } from "../utils/os.ts";
import type { PendingPermission } from "./permission.ts";
import { preserveToolInput } from "./toolInputSnapshot.ts";
import type { ServerResponse } from "node:http";
import type { AppConfig } from "../types.ts";
import { modelProxyEnvironment } from "../utils/modelProxyEnvironment.ts";

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

/** Bound registration so an unavailable Open-ACE API cannot hang chat. */
const OPENACE_REGISTRATION_TIMEOUT_MS = 10_000;

/** Keep best-effort cleanup bounded after an ambiguous registration failure. */
const OPENACE_CLEANUP_TIMEOUT_MS = 3_000;

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
 * Hard safety cap used when the client disconnects while a permission prompt is
 * pending. We do NOT abort on disconnect in that case (issue #186): we let the
 * turn keep running so the user — or the 28 s backend safety auto-approve — can
 * resolve the prompt and the just-approved tool can actually execute. This timer
 * only force-aborts if the prompt is STILL unresolved after the delay (neither
 * path settled it), so a stuck request can't hold the CLI forever. It sits just
 * past the 28 s safety auto-approve and the CLI's 30 s control-request timeout.
 *
 * It must NOT abort a turn that is already running: the safety auto-approve
 * resolves the prompt at 28 s, so by 32 s the prompt is gone and this timer is a
 * no-op, leaving the running turn to be cleaned up by executeQwenCommand's
 * finally block.
 * @see https://github.com/ivycomputing/qwen-code-webui/issues/186
 */
const PENDING_PERMISSION_ABORT_DELAY_MS = 32_000; // 32 seconds

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || error.message === "Operation aborted";
}

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
// Currently empty - ask_user_question now has full dialog support.
const AUTO_APPROVE_NO_DIALOG_TOOLS: Set<string> = new Set([]);

/**
 * Check if running in Open-ACE integration mode.
 * OPENAI_BASE_URL alone is not sufficient because standalone installations
 * may use an arbitrary OpenAI-compatible endpoint.
 */
export function isIntegratedMode(config: AppConfig): boolean {
  return !!(config.openaceApiUrl || getEnv("OPENACE_API_URL"));
}

/**
 * Get Open-ACE session API URL from config.
 * Returns null if not configured.
 */
export function getOpenAceSessionApi(config: AppConfig): string | null {
  const baseUrl = config.openaceApiUrl || getEnv("OPENACE_API_URL");
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/api/workspace/sessions`;
}

async function cleanupOpenAceSession(
  sessionId: string,
  config: AppConfig,
  token?: string,
): Promise<void> {
  const sessionApi = getOpenAceSessionApi(config);
  if (!sessionApi) return;

  const cleanupController = new AbortController();
  const timeoutId = setTimeout(
    () => cleanupController.abort(),
    OPENACE_CLEANUP_TIMEOUT_MS,
  );
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const response = await fetch(
      `${sessionApi}/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers,
        signal: cleanupController.signal,
      },
    );
    if (!response.ok && response.status !== 404) {
      logger.chat.warn(
        "Failed to clean up an unconfirmed Open-ACE session: HTTP {status}",
        { status: response.status, sessionId },
      );
    }
  } catch (error) {
    logger.chat.warn(
      "Failed to clean up an unconfirmed Open-ACE session: {error}",
      {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Register session with Open-ACE before first request.
 * This ensures the session ID is known to Open-ACE when the first LLM request
 * arrives with X-Session-Id header.
 *
 * @returns true if registration succeeded, false otherwise
 */
export async function registerWithOpenAce(
  sessionId: string,
  projectPath: string,
  config: AppConfig,
  token?: string,
  signal?: AbortSignal,
): Promise<{ success: boolean; error?: string }> {
  const sessionApi = getOpenAceSessionApi(config);
  if (!sessionApi) {
    return { success: false, error: "Open-ACE API not configured" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const registrationController = new AbortController();
  const abortRegistration = () => registrationController.abort();
  if (signal?.aborted) {
    registrationController.abort();
  } else {
    signal?.addEventListener("abort", abortRegistration, { once: true });
  }
  const timeoutId = setTimeout(abortRegistration, OPENACE_REGISTRATION_TIMEOUT_MS);
  let registrationAttempted = false;
  let registrationConfirmed = false;

  try {
    registrationAttempted = true;
    const response = await fetch(sessionApi, {
      method: "POST",
      headers,
      signal: registrationController.signal,
      body: JSON.stringify({
        tool_name: "qwen-code",
        session_type: "chat",
        project_path: projectPath,
        title: `Session in ${projectPath.split("/").pop()}`,
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Open-ACE registration failed: ${response.status} ${response.statusText}`,
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        success: false,
        error: "Open-ACE registration returned an invalid response",
      };
    }
    const registration = payload as {
      success?: boolean;
      data?: { session_id?: string };
    };
    if (registration.success !== true || registration.data?.session_id !== sessionId) {
      return {
        success: false,
        error: "Open-ACE registration response did not confirm the requested session",
      };
    }

    registrationConfirmed = true;
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: registrationController.signal.aborted
        ? "Open-ACE registration was cancelled or timed out"
        : `Network error: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRegistration);
    if (registrationAttempted && !registrationConfirmed) {
      await cleanupOpenAceSession(sessionId, config, token);
    }
  }
}

/**
 * Generate a session ID that conforms to Open-ACE constraints:
 * - Character set: [alnum-_:] (alphanumeric, hyphen, underscore, colon)
 * - Length: ≤100 characters
 *
 * UUID v4 format satisfies these constraints:
 * - Contains: a-z, 0-9, and hyphens
 * - Length: 36 characters
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

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
  isNewSession?: boolean,
  delegatedEnvironment?: Record<string, string>,
): Promise<void> {
  if (delegatedEnvironment) {
    const originalEnqueue = enqueue;
    const token = delegatedEnvironment.OPENAI_API_KEY;
    enqueue = response => originalEnqueue(JSON.parse(JSON.stringify(response).split(token).join("[model-proxy-token]")));
  }
  let abortController: AbortController | undefined;
  let onAbort: (() => void) | undefined;
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
    registerTrackedCliRequest(requestId, { sessionId, cliPath });
    const query = await loadQwenQuery();

    onAbort = () => {
      signalTrackedCliAbort(requestId, "internal_abort");
    };
    abortController.signal.addEventListener("abort", onAbort, { once: true });

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
      if (abortController!.signal.aborted) {
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

      // For ask_user_question tool, extract and validate questions from input
      const confirmationType = toolName === "ask_user_question" ? "ask_user_question" : "default";
      let questions:
        | Array<{
            question: string;
            header: string;
            options: Array<{ label: string; description?: string }>;
            multiSelect: boolean;
          }>
        | undefined;

      if (toolName === "ask_user_question" && input?.questions) {
        // Runtime validation for questions array
        const rawQuestions = input.questions;
        if (
          Array.isArray(rawQuestions) &&
          rawQuestions.length >= 1 &&
          rawQuestions.length <= 4 &&
          rawQuestions.every((q) =>
            typeof q === "object" &&
            q !== null &&
            typeof q.question === "string" &&
            typeof q.header === "string" &&
            Array.isArray(q.options) &&
            q.options.length >= 2 &&
            q.options.length <= 4 &&
            q.options.every((o: unknown) =>
              typeof o === "object" &&
              o !== null &&
              typeof (o as { label?: unknown }).label === "string"
            ) &&
            typeof q.multiSelect === "boolean"
          )
        ) {
          questions = rawQuestions.map((q) => ({
            question: String(q.question),
            header: String(q.header).substring(0, 12), // Limit header to 12 chars
            options: q.options.map((o: { label: string; description?: string }) => ({
              label: String(o.label),
              description: o.description ? String(o.description) : undefined,
            })),
            multiSelect: Boolean(q.multiSelect),
          }));
        } else {
          logger.chat.warn("Invalid questions format for ask_user_question tool", {
            questions: rawQuestions,
          });
        }
      }

      if (
        !enqueue({
          type: "permission_request",
          permissionId,
          toolName,
          toolInput: input,
          suggestions,
          autoApproveMs: AUTO_APPROVE_MS,
          confirmationType,
          questions,
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
        abortController!.signal.addEventListener("abort", onAbort, { once: true });

        // Preserve a snapshot of the input so it can be merged back when the
        // user responds. For ask_user_question this snapshot is the only
        // server-side source of the original questions (see toolInputSnapshot).
        const clonedInput = preserveToolInput(input, toolName);

        pendingPermissions.set(permissionId, {
          resolve: (result, scope) => {
            clearTimeout(safetyTimer);
            abortController!.signal.removeEventListener("abort", onAbort);
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
          abortSignal: abortController!.signal,
          requestId, // 用于 cancel() 中检测 pending permissions
          toolName,
          originalInput: clonedInput,
        });
      });
    };

    // Build environment variables for CLI subprocess.
    // When the LLM proxy is running (Open-ACE integration mode), override
    // OPENAI_BASE_URL to route requests through our local proxy, which injects
    // the X-Session-Id header for proper session attribution.
    // @see https://github.com/ivycomputing/qwen-code-webui/issues/220
    //
    // Session ID is now generated upfront for new sessions in integration mode,
    // and registered with Open-ACE before the first request. This ensures the
    // first turn gets proper session attribution (issue #222).
    const cliEnv: Record<string, string> = { ...delegatedEnvironment };
    if (!delegatedEnvironment && sessionId && isProxyRunning()) {
      const proxyBaseUrl = getProxyBaseUrl(sessionId);
      if (proxyBaseUrl) {
        cliEnv.OPENAI_BASE_URL = proxyBaseUrl;
        logger.chat.debug(
          "Routing CLI through LLM proxy for session {sessionId}: {proxyBaseUrl}",
          { sessionId, proxyBaseUrl },
        );
      }
    }

    await runWithTrackedCliRequest(requestId, async () => {
      for await (const rawSdkMessage of query({
        prompt: processedMessage,
        options: {
          abortController: abortController!,
          pathToQwenExecutable: cliPath,
          // Use sessionId for new sessions (SDK generates/uses the ID),
          // resume for existing sessions (reusing previous session ID).
          // This ensures session ID consistency between our registration
          // and the CLI's internal session management.
          ...(isNewSession && sessionId ? { sessionId } : {}),
          ...(!isNewSession && sessionId ? { resume: sessionId } : {}),
          ...(allowedTools ? { allowedTools } : {}),
          ...(workingDirectory ? { cwd: workingDirectory } : {}),
          ...(mappedPermissionMode ? { permissionMode: mappedPermissionMode } : {}),
          ...(model ? { model } : {}),
          ...(authType ? { authType } : {}),
          ...(Object.keys(cliEnv).length > 0 ? { env: cliEnv } : {}),
          stderr: (message: string) => {
            if (delegatedEnvironment) message = message.split(delegatedEnvironment.OPENAI_API_KEY).join("[model-proxy-token]");
            logger.chat.info("CLI stderr: {message}", { message });
          },
          canUseTool,
          timeout: { canUseTool: SESSION_TIMEOUT_MS, controlRequest: SESSION_TIMEOUT_MS },
        },
      })) {
        const sdkMessage: typeof rawSdkMessage = delegatedEnvironment
          ? JSON.parse(JSON.stringify(rawSdkMessage).split(delegatedEnvironment.OPENAI_API_KEY).join("[model-proxy-token]"))
          : rawSdkMessage;
        messageCount++;
        if (firstMessageLatencyMs === null) {
          firstMessageLatencyMs = Date.now() - startTime;
          logger.chat.info(
            "[DIAG] First SDK message received requestId={requestId} latencyMs={latencyMs}",
            { requestId, latencyMs: firstMessageLatencyMs },
          );
        }
        const sdkSessionId = (sdkMessage as Record<string, unknown>).session_id;
        if (typeof sdkSessionId === "string") {
          updateTrackedCliSessionId(requestId, sdkSessionId);
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
        // Loop detection: non-fatal loop aborts are skipped in YOLO mode to
        // allow autonomous iterative workflows (e.g., fix_issue skill:
        // test → fix → test again). Fatal errors (input_closed) still abort —
        // the CLI process is dead, matching the frontend's recordAutoRejection
        // ordering (fatal check before the YOLO bypass). checkLoop always runs
        // so the per-agent counters stay warm.
        const loopResult = checkLoop(sdkMessage, ls);
        if (
          loopResult &&
          (mappedPermissionMode !== "yolo" || isFatalFingerprint(loopResult.fingerprint))
        ) {
          logger.chat.error(
            "Loop detected: fingerprint={fingerprint}, count={count}, preview={preview}, aborting CLI",
            {
              fingerprint: loopResult.fingerprint,
              count: loopResult.count,
              preview: loopResult.preview,
            },
          );
          abortController!.abort();
          const errorMessage = loopResult.fingerprint === "input_closed"
            ? "CLI session ended unexpectedly. Please send a new message."
            : `Auto-aborted: loop detected (${loopResult.fingerprint}, ${loopResult.count}x) — ${loopResult.preview}`;
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
    });

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
    if (abortController?.signal.aborted || isAbortLikeError(error)) {
      enqueue({ type: "aborted" });
      enqueue({ type: "done" });
      return;
    }
    const safeError = delegatedEnvironment
      ? new Error(error instanceof Error ? error.message.split(delegatedEnvironment.OPENAI_API_KEY).join("[model-proxy-token]") : "CLI request failed")
      : error;
    logger.chat.error(
      "[DIAG] Chat request ERROR requestId={requestId} durationMs={durationMs} "
      + "messageCount={messageCount} error={error}",
      {
        requestId,
        durationMs: Date.now() - startTime,
        messageCount,
        error: safeError,
      },
    );
    enqueue({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    enqueue({ type: "done" });
  } finally {
    _activeChatCount--;
    if (abortController && onAbort) {
      abortController.signal.removeEventListener("abort", onAbort);
    }
    // Ensure CLI subprocess is killed on any exit path (issue #84)
    const ac = requestAbortControllers.get(requestId);
    if (ac) {
      ac.abort();
      requestAbortControllers.delete(requestId);
    }
    finalizeTrackedCliRequest(requestId);
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
// Optional single-instance coordination for a deliberately shared maintenance
// workspace. The lock lasts until CLI completion, not browser disconnection.
// It is a collaboration guard and does not provide user/runtime isolation.
const serializedServers = new WeakSet<Map<string, AbortController>>();
export async function handleChatRequest(
  c: Context,
  requestAbortControllers: Map<string, AbortController>,
  pendingPermissions: Map<string, PendingPermission>,
) {
  let delegatedEnvironment: Record<string, string> | undefined;
  try {
    const config = c.var.config as AppConfig;
    if (config.modelProxyBaseUrl && getEnv("OPENACE_API_URL")) throw new Error("Conflicting model gateways");
    delegatedEnvironment = modelProxyEnvironment(config, config.modelProxyBaseUrl ? c.req.header("X-Model-Proxy-Token") : undefined);
  } catch {
    return c.json({ error: "Delegated model configuration or credential unavailable" }, 403);
  }
  if (!(c.var.config as AppConfig).serializeChatRequests) {
    return handleChatRequestUnlocked(c, requestAbortControllers, pendingPermissions, undefined, delegatedEnvironment);
  }
  if (serializedServers.has(requestAbortControllers)) {
    // The lock has no timeout by design; expose the active request ids so an
    // authenticated caller can recover a stuck turn via /api/abort/:requestId.
    // The list is empty only in the brief window before executeQwenCommand
    // registers the holder (body parse, session bridge, registration); an
    // empty list still means "lock held", not "no holder".
    return c.json(
      {
        error: "Shared workspace has an active request; wait or cancel it first",
        active_request_ids: [...requestAbortControllers.keys()],
      },
      409,
    );
  }
  serializedServers.add(requestAbortControllers);
  const release = () => { serializedServers.delete(requestAbortControllers); };
  try { return await handleChatRequestUnlocked(c, requestAbortControllers, pendingPermissions, release, delegatedEnvironment); }
  catch (error) { release(); throw error; }
}

async function handleChatRequestUnlocked(
  c: Context,
  requestAbortControllers: Map<string, AbortController>,
  pendingPermissions: Map<string, PendingPermission>,
  onComplete?: () => void,
  delegatedEnvironment?: Record<string, string>,
) {
  const chatRequest: ChatRequest = await c.req.json();
  const config = c.var.config as AppConfig;
  const { cliPath } = config;
  const authType = config.authType as AuthType | undefined;
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
  let registrationAbortController: AbortController | undefined;

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
        // Open-ACE integration: pre-register session before first request
        // This ensures the session ID is known to Open-ACE when the first LLM request
        // arrives with X-Session-Id header, avoiding 404 session_not_found errors.
        // For new sessions in integration mode, we generate the session ID upfront
        // and register it with Open-ACE before starting the CLI.
        let effectiveSessionId = chatRequest.sessionId;
        const isNewSession = !chatRequest.sessionId;

        if (isNewSession && isIntegratedMode(config)) {
          // Generate session ID upfront for new sessions in integration mode
          effectiveSessionId = generateSessionId();
          logger.chat.debug(
            "Generated session ID for new session in integration mode: {sessionId}",
            { sessionId: effectiveSessionId },
          );

          // Register before starting the CLI. Sending an unregistered session ID
          // would make Open-ACE reject the subsequent model request with 404.
          // Extract token from request for authentication (RFC 9110 auth-scheme
          // is case-insensitive, so accept "bearer" as well as "Bearer")
          const token = c.req.header?.("Authorization")?.replace(/^Bearer\s+/i, "") ||
                       c.req.query?.("token");

          registrationAbortController = new AbortController();
          const requestSignal = c.req.raw?.signal;
          const abortOnRequestClose = () => registrationAbortController?.abort();
          if (requestSignal?.aborted) {
            registrationAbortController.abort();
          } else {
            requestSignal?.addEventListener("abort", abortOnRequestClose, { once: true });
          }
          let registerResult: { success: boolean; error?: string };
          try {
            registerResult = await registerWithOpenAce(
              effectiveSessionId,
              chatRequest.workingDirectory || process.cwd(),
              config,
              token,
              registrationAbortController.signal,
            );
          } finally {
            requestSignal?.removeEventListener("abort", abortOnRequestClose);
            registrationAbortController = undefined;
          }

          if (registerResult.success) {
            logger.chat.info(
              "Registered session with Open-ACE: {sessionId}",
              { sessionId: effectiveSessionId },
            );
          } else {
            logger.chat.warn(
              "Failed to register session with Open-ACE: {error}. Aborting model request.",
              { error: registerResult.error, sessionId: effectiveSessionId },
            );
            throw new Error("Unable to register this session with Open-ACE. Please retry.");
          }
        }

        await executeQwenCommand(
          chatRequest.message,
          chatRequest.requestId,
          requestAbortControllers,
          pendingPermissions,
          enqueue,
          cliPath,
          effectiveSessionId,
          chatRequest.allowedTools,
          chatRequest.workingDirectory,
          chatRequest.permissionMode,
          chatRequest.model,
          authType,
          isNewSession, // Pass flag to indicate new session
          delegatedEnvironment,
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
      } finally {
        onComplete?.();
      }
    },
    cancel() {
      clearInterval(keepaliveId);
      registrationAbortController?.abort();
      registrationAbortController = undefined;
      const ac = requestAbortControllers.get(chatRequest.requestId);
      if (ac) {
        // 检查是否有属于当前请求的 pending permissions
        const pendingForThisRequest = [...pendingPermissions.entries()]
          .filter(([, pending]) => pending.requestId === chatRequest.requestId);

        if (pendingForThisRequest.length > 0) {
          // Pending permission while the client disconnects: do NOT abort. Letting
          // the turn keep running is the whole point of issue #186 — the user (or
          // the 28 s backend safety auto-approve) can still resolve the prompt, and
          // the approved tool can then execute. executeQwenCommand's finally block
          // aborts and cleans up the controller + session when the turn ends.
          logger.chat.info(
            "[DIAG] Client DISCONNECTED with pending permissions, deferring abort "
            + "requestId={requestId} pendingCount={pendingCount} activeCount={activeCount} "
            + "concurrentRequests={concurrentRequests}",
            {
              requestId: chatRequest.requestId,
              pendingCount: pendingForThisRequest.length,
              activeCount: _activeChatCount,
              concurrentRequests: requestAbortControllers.size,
            },
          );

          // Abort + cleanup, used only by the stuck-request safety timer below.
          const forceAbort = () => {
            ac.abort();
            requestAbortControllers.delete(chatRequest.requestId);
            if (chatRequest.sessionId && activeSessions.get(chatRequest.sessionId) === chatRequest.requestId) {
              activeSessions.delete(chatRequest.sessionId);
            }
          };

          // Safety net: force-abort only if the prompt is STILL pending after the
          // delay (neither the user nor the 28 s safety auto-approve settled it), so
          // a stuck request can't hold the CLI forever. If the prompt was already
          // resolved, the turn is running and the finally block will clean it up —
          // aborting now would kill the approved tool mid-execution (issue #186).
          const delayTimer = setTimeout(() => {
            const stillPending = [...pendingPermissions.values()]
              .some((p) => p.requestId === chatRequest.requestId);
            if (stillPending) {
              logger.chat.warn(
                "[DIAG] Pending permission still unresolved after delay, force-aborting requestId={requestId}",
                { requestId: chatRequest.requestId },
              );
              forceAbort();
            }
          }, PENDING_PERMISSION_ABORT_DELAY_MS);
          if (delayTimer.unref) delayTimer.unref();

          // When the user resolves the prompt, stop the safety timer and let the
          // turn continue. Do NOT abort here: originalResolve() only schedules the
          // canUseTool microtask, while ac.abort() synchronously fires transport
          // teardown → SIGTERM in the same tick, killing the CLI before the
          // just-approved tool runs. The finally block handles cleanup on turn end.
          const onResolved = () => {
            clearTimeout(delayTimer);
            logger.chat.info(
              "[DIAG] Pending permission resolved after disconnect, letting turn continue requestId={requestId}",
              { requestId: chatRequest.requestId },
            );
          };

          // Wrap each pending permission's resolve so we detect settlement.
          for (const [permissionId, pending] of pendingForThisRequest) {
            const originalResolve = pending.resolve;
            pendingPermissions.set(permissionId, {
              ...pending,
              resolve: (result, scope) => {
                originalResolve(result, scope);
                onResolved();
              },
            });
          }
        } else {
          // 无 pending permissions，立即 abort（保持现有行为）
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

          // 诊断日志
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

          // Clean up session mapping
          if (chatRequest.sessionId && activeSessions.get(chatRequest.sessionId) === chatRequest.requestId) {
            activeSessions.delete(chatRequest.sessionId);
          }
        }
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
