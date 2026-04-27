import { useCallback, useMemo } from "react";
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

export function useStreamParser() {
  // Create a single unified processor instance
  const processor = useMemo(() => new UnifiedMessageProcessor(), []);

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
        setCurrentThinkingMessage: context.setCurrentThinkingMessage,
        updateThinkingMessage: context.updateThinkingMessage,

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
      };
    },
    [],
  );

  const processQwenData = useCallback(
    (qwenData: SDKMessage, context: StreamingContext) => {
      const processingContext = adaptContext(context);

      // Validate message types before processing
      switch (qwenData.type) {
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
