import type { AllMessage, ChatMessage, ThinkingMessage } from "../../types";
import { useMessageConverter } from "../useMessageConverter";
import type { CommandLoopRequest } from "../chat/usePermissions";

/** Context data provided when a thinking timeout fires */
export interface ThinkingTimeoutContext {
  /** Whether the timeout was caused by idle (no new output) or absolute (total time exceeded) */
  reason: "idle" | "absolute";
  /** Seconds since the relevant threshold was crossed */
  elapsedSeconds: number;
}

export interface ThinkingTimeoutInfo {
  /** Triggered when thinking exceeds the timeout */
  onThinkingTimeout: (accumulatedContent: string, info: ThinkingTimeoutContext) => void;
}

export interface StreamingContext {
  currentAssistantMessage: ChatMessage | null;
  setCurrentAssistantMessage: (msg: ChatMessage | null) => void;
  addMessage: (msg: AllMessage) => void;
  updateLastMessage: (updates: Partial<ChatMessage> | string) => void;
  // Thinking message consolidation (streaming)
  currentThinkingMessage?: ThinkingMessage | null;
  setCurrentThinkingMessage?: (msg: ThinkingMessage | null) => void;
  updateThinkingMessage?: (content: string) => void;
  onSessionId?: (sessionId: string) => void;
  shouldShowInitMessage?: () => boolean;
  onInitMessageShown?: () => void;
  hasReceivedInit?: boolean;
  setHasReceivedInit?: (received: boolean) => void;
  onPermissionError?: (
    toolName: string,
    patterns: string[],
    toolUseId: string,
    requestId?: string,
  ) => void;
  onAbortRequest?: () => void;
  // Auto-rejection loop detection (SDK-level rejections, e.g. stdin closed)
  onAutoRejection?: (
    toolName: string,
    content: string,
  ) => CommandLoopRequest | null;
  // Command result loop detection
  onCommandResultLoop?: (
    toolName: string,
    input: Record<string, unknown>,
    result: { exitCode?: number; output: string }
  ) => CommandLoopRequest | null;
  onShowCommandLoopRequest?: (request: CommandLoopRequest) => void;
  // Proactive canUseTool permission handling
  onPermissionRequest?: (event: {
    permissionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    suggestions: Array<{ type: string; label: string; description?: string }>;
  }) => void;
  // Cleanup orphan permission dialogs after SDK timeout/stream resume
  onPermissionOrphanCleanup?: () => void;
  // Thinking timeout
  thinkingTimeout?: ThinkingTimeoutInfo;
}

/**
 * Hook that provides message processing functions for streaming context.
 * Now delegates to the unified message converter for consistency.
 */
export function useMessageProcessor() {
  const converter = useMessageConverter();

  return {
    // Delegate to unified converter
    createSystemMessage: converter.createSystemMessage,
    createToolMessage: converter.createToolMessage,
    createResultMessage: converter.createResultMessage,
    createToolResultMessage: converter.createToolResultMessage,
    createThinkingMessage: converter.createThinkingMessage,
    convertTimestampedSDKMessage: converter.convertTimestampedSDKMessage,
    convertConversationHistory: converter.convertConversationHistory,
  };
}
