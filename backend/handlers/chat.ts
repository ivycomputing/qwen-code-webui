import { Context } from "hono";
import { query, type PermissionMode, type AuthType } from "@qwen-code/sdk";
import type { ChatRequest, StreamResponse } from "../../shared/types.ts";
import { logger } from "../utils/logger.ts";

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
 * Executes a Qwen command and yields streaming responses
 * @param message - User message or command
 * @param requestId - Unique request identifier for abort functionality
 * @param requestAbortControllers - Shared map of abort controllers
 * @param cliPath - Path to actual CLI script (detected by validateQwenCli)
 * @param sessionId - Optional session ID for conversation continuity
 * @param allowedTools - Optional array of allowed tool names
 * @param workingDirectory - Optional working directory for Qwen execution
 * @param permissionMode - Optional permission mode for Qwen execution
 * @param model - Optional model to use for the query
 * @returns AsyncGenerator yielding StreamResponse objects
 */
async function* executeQwenCommand(
  message: string,
  requestId: string,
  requestAbortControllers: Map<string, AbortController>,
  cliPath: string,
  sessionId?: string,
  allowedTools?: string[],
  workingDirectory?: string,
  permissionMode?: string,
  model?: string,
  authType?: AuthType,
): AsyncGenerator<StreamResponse> {
  let abortController: AbortController;

  try {
    // Process commands that start with '/'
    let processedMessage = message;
    if (message.startsWith("/")) {
      // Remove the '/' and send just the command
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
      },
    })) {
      // Debug logging of raw SDK messages with detailed content
      logger.chat.debug("Qwen SDK Message: {sdkMessage}", { sdkMessage });

      yield {
        type: "claude_json",
        data: sdkMessage,
      };
    }

    yield { type: "done" };
  } catch (error) {
    // Check if error is due to abort
    // TODO: Re-enable when AbortError is properly exported from Qwen SDK
    // if (error instanceof AbortError) {
    //   yield { type: "aborted" };
    // } else {
    {
      logger.chat.error("Qwen Code execution failed: {error}", { error });
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } finally {
    // Clean up AbortController from map
    if (requestAbortControllers.has(requestId)) {
      requestAbortControllers.delete(requestId);
    }
  }
}

/**
 * Handles POST /api/chat requests with streaming responses
 * @param c - Hono context object with config variables
 * @param requestAbortControllers - Shared map of abort controllers
 * @returns Response with streaming NDJSON
 */
export async function handleChatRequest(
  c: Context,
  requestAbortControllers: Map<string, AbortController>,
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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of executeQwenCommand(
          chatRequest.message,
          chatRequest.requestId,
          requestAbortControllers,
          cliPath, // Use detected CLI path from validateQwenCli
          chatRequest.sessionId,
          chatRequest.allowedTools,
          chatRequest.workingDirectory,
          chatRequest.permissionMode,
          chatRequest.model,
          authType,
        )) {
          const data = JSON.stringify(chunk) + "\n";
          controller.enqueue(new TextEncoder().encode(data));
        }
        controller.close();
      } catch (error) {
        const errorResponse: StreamResponse = {
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        };
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify(errorResponse) + "\n"),
        );
        controller.close();
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
