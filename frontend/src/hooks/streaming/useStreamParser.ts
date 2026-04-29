import { useCallback, useMemo, useRef } from "react";
import type {
  StreamResponse,
  SDKMessage,
  SystemMessage,
  AbortMessage,
} from "../../types";
import {
  isSystemMessage,
  isAssistantMessage,
  isResultMessage,
  isUserMessage,
  isStreamEventMessage,
} from "../../utils/messageTypes";
import type { StreamingContext } from "./useMessageProcessor";
import {
  UnifiedMessageProcessor,
  type ProcessingContext,
} from "../../utils/UnifiedMessageProcessor";

const THINKING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function useStreamParser() {
  // Create a single unified processor instance
  const processor = useMemo(() => new UnifiedMessageProcessor(), []);

  // Thinking timeout tracking
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingStartRef = useRef<number>(0);
  const thinkingContentRef = useRef<string>("");

  const clearThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  }, []);

  // Convert StreamingContext to ProcessingContext
  const adaptContext = useCallback(
    (context: StreamingContext): ProcessingContext => {
      return {
        // Core message handling
        addMessage: context.addMessage,
        updateLastMessage: context.updateLastMessage,

        // Current assistant message state
        currentAssistantMessage: context.currentAssistantMessage,
        setCurrentAssistantMessage: context.setCurrentAssistantMessage,

        // Current thinking message state
        currentThinkingMessage: context.currentThinkingMessage,
        setCurrentThinkingMessage: (msg) => {
          context.setCurrentThinkingMessage?.(msg);
          if (msg && context.thinkingTimeout) {
            // Start thinking timer when a new thinking message begins
            if (!thinkingTimerRef.current) {
              thinkingStartRef.current = Date.now();
              thinkingContentRef.current = msg.content;
              thinkingTimerRef.current = setTimeout(() => {
                const elapsed = Math.round((Date.now() - thinkingStartRef.current) / 1000);
                const content = thinkingContentRef.current;
                console.warn(`Thinking timeout after ${elapsed}s, auto-aborting`);
                context.thinkingTimeout!.onThinkingTimeout(content);
              }, THINKING_TIMEOUT_MS);
            }
          } else if (!msg) {
            // Thinking ended — clear timer
            clearThinkingTimer();
          }
        },
        updateThinkingMessage: (content: string) => {
          context.updateThinkingMessage?.(content);
          // Track latest thinking content for timeout notification
          thinkingContentRef.current = content;
        },

        // Session handling
        onSessionId: context.onSessionId,
        hasReceivedInit: context.hasReceivedInit,
        setHasReceivedInit: context.setHasReceivedInit,

        // Init message handling
        shouldShowInitMessage: context.shouldShowInitMessage,
        onInitMessageShown: context.onInitMessageShown,

        // Permission/Error handling
        onPermissionError: context.onPermissionError,
        onAbortRequest: context.onAbortRequest,

        // Auto-rejection loop detection
        onAutoRejection: context.onAutoRejection,

        // Command result loop detection
        onCommandResultLoop: context.onCommandResultLoop,
        onShowCommandLoopRequest: context.onShowCommandLoopRequest,

        // Thinking timeout
        onThinkingTimeout: context.thinkingTimeout?.onThinkingTimeout,
      };
    },
    [clearThinkingTimer],
  );

  const processQwenData = useCallback(
    (qwenData: SDKMessage, context: StreamingContext) => {
      const processingContext = adaptContext(context);

      // Validate message types before processing
      const msgType = (qwenData as { type: string }).type;
      switch (msgType) {
        case "system":
          if (!isSystemMessage(qwenData)) {
            console.warn("Invalid system message:", qwenData);
            return;
          }
          break;
        case "assistant":
          if (!isAssistantMessage(qwenData)) {
            console.warn("Invalid assistant message:", qwenData);
            return;
          }
          break;
        case "result":
          if (!isResultMessage(qwenData)) {
            console.warn("Invalid result message:", qwenData);
            return;
          }
          break;
        case "user":
          if (!isUserMessage(qwenData)) {
            console.warn("Invalid user message:", qwenData);
            return;
          }
          break;
        case "stream_event":
          // Qwen SDK specific: handle partial/streaming messages
          if (!isStreamEventMessage(qwenData)) {
            console.warn("Invalid stream_event message:", qwenData);
            return;
          }
          break;
        case "tool_result":
          // Qwen SDK sends tool results as top-level messages (not in SDKMessage union)
          // Process without type guard since it's not in the TypeScript types
          break;
        default:
          console.log("Unknown Qwen message type:", qwenData);
          return;
      }

      // Process the message using the unified processor
      processor.processMessage(qwenData, processingContext, {
        isStreaming: true,
      });
    },
    [processor, adaptContext],
  );

  const processStreamLine = useCallback(
    (line: string, context: StreamingContext) => {
      try {
        const data: StreamResponse = JSON.parse(line);

        if (data.type === "claude_json" && data.data) {
          // data.data is already an SDKMessage object, no need to parse
          const qwenData = data.data as SDKMessage;
          processQwenData(qwenData, context);
          // SDK resumed after canUseTool timeout — clean up orphan permission dialog
          if (context.onPermissionOrphanCleanup) {
            context.onPermissionOrphanCleanup();
          }
        } else if (data.type === "permission_request") {
          // Proactive canUseTool flow: backend paused SDK, show permission dialog
          if (context.onPermissionRequest) {
            context.onPermissionRequest({
              permissionId: data.permissionId!,
              toolName: data.toolName!,
              toolInput: (data.toolInput as Record<string, unknown>) || {},
              suggestions: data.suggestions || [],
            });
          }
        } else if (data.type === "error") {
          const errorMessage: SystemMessage = {
            type: "error",
            subtype: "stream_error",
            message: data.error || "Unknown error",
            timestamp: Date.now(),
          };
          context.addMessage(errorMessage);
        } else if (data.type === "aborted") {
          const abortedMessage: AbortMessage = {
            type: "system",
            subtype: "abort",
            message: "Operation was aborted by user",
            timestamp: Date.now(),
          };
          context.addMessage(abortedMessage);
          context.setCurrentAssistantMessage(null);
        }
      } catch (parseError) {
        console.error("Failed to parse stream line:", parseError);
      }
    },
    [processQwenData],
  );

  return {
    processStreamLine,
  };
}
