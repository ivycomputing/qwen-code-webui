import { Context } from "hono";
import { query, type PermissionMode, type AuthType } from "@qwen-code/sdk";
import type { ChatRequest, StreamResponse } from "../../shared/types.ts";
import { logger } from "../utils/logger.ts";
import { checkLoop, type LoopState } from "../utils/loopDetector.ts";
import type { PendingPermission } from "./permission.ts";

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
  // Remember tools the user already approved during this request — avoids
  // repeated permission dialogs for the same tool within one streaming session.
  const localAllowedTools = new Set<string>();

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

    const loopState: LoopState = { errorCount: 0, lastFingerprint: "", firstErrorTime: 0 };

    // Create the canUseTool callback — proactive permission handling
    const canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      _options: { signal: AbortSignal; suggestions?: unknown[] | null },
    ): Promise<{ behavior: "allow" | "deny"; updatedInput?: Record<string, unknown>; message?: string }> => {
      // Defense 1: check main query abort (not SDK's per-request signal)
      if (abortController.signal.aborted) {
        return { behavior: "deny", message: "Request aborted" };
      }

      // Auto-approve if user already allowed this tool during this request
      if (localAllowedTools.has(toolName)) {
        logger.chat.debug("canUseTool: auto-approving previously allowed tool {toolName}", { toolName });
        return { behavior: "allow", updatedInput: input };
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
      return new Promise((resolve) => {
        const onAbort = () => {
          pendingPermissions.delete(permissionId);
          localPendingIds.delete(permissionId);
          resolve({ behavior: "deny", message: "Request aborted" });
        };
        abortController.signal.addEventListener("abort", onAbort, { once: true });

        pendingPermissions.set(permissionId, {
          resolve: (result) => {
            abortController.signal.removeEventListener("abort", onAbort);
            localPendingIds.delete(permissionId);
            // Remember approval so subsequent calls to the same tool are auto-approved
            if (result.behavior === "allow") {
              localAllowedTools.add(toolName);
            }
            resolve(result);
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
        canUseTool,
        timeout: { canUseTool: 300_000 },
      },
    })) {
      // Backend loop detection — failsafe if frontend detection fails
      const loopResult = checkLoop(sdkMessage, loopState);
      if (loopResult) {
        logger.chat.error(
          "Loop detected: fingerprint={fingerprint}, count={count}, aborting CLI",
          { fingerprint: loopResult.fingerprint, count: loopResult.count },
        );
        abortController.abort();
        if (!enqueue({
          type: "error",
          error: `Auto-aborted: loop detected (${loopResult.fingerprint}, ${loopResult.count}x)`,
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
  } catch (error) {
    logger.chat.error("Qwen Code execution failed: {error}", { error });
    enqueue({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Ensure CLI subprocess is killed on any exit path (issue #84)
    const ac = requestAbortControllers.get(requestId);
    if (ac) {
      ac.abort();
      requestAbortControllers.delete(requestId);
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

  logger.chat.debug(
    "Received chat request {*}",
    chatRequest as unknown as Record<string, unknown>,
  );
  logger.chat.debug(
    "Chat request permissionMode: {permissionMode}",
    { permissionMode: chatRequest.permissionMode },
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (response: StreamResponse): boolean => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(response) + "\n"));
          return true;
        } catch {
          return false;
        }
      };

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
        controller.close();
      } catch (error) {
        const errorResponse: StreamResponse = {
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        };
        enqueue(errorResponse);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      // Client disconnected — kill CLI subprocess to prevent infinite retry loops
      const ac = requestAbortControllers.get(chatRequest.requestId);
      if (ac) {
        logger.chat.info("Client disconnected, aborting CLI subprocess for request {requestId}", {
          requestId: chatRequest.requestId,
        });
        ac.abort();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
