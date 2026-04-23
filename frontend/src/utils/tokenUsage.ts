import type {
  AllMessage,
  ChatMessage,
  SystemMessage,
  ToolMessage,
  ToolResultMessage,
  ThinkingMessage,
} from "../types";
import type { ExtendedUsage } from "@qwen-code/sdk";

/**
 * Token usage information for display in the status bar
 * Uses promptTokens (current request's input tokens) instead of accumulated tokens
 */
export interface TokenUsageInfo {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Per-category token breakdown */
export interface ContextCategoryBreakdown {
  overhead: number;
  messages: number;
  freeSpace: number;
  autocompactBuffer: number;
}

/** Message sub-category breakdown */
export interface MessageBreakdown {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  thinking: number;
}

/** Complete context usage data for the panel */
export interface ContextUsageData {
  totalTokens: number;
  contextWindowSize: number;
  modelName: string;
  percentage: number;
  breakdown: ContextCategoryBreakdown;
  messageBreakdown: MessageBreakdown;
  hasCacheData: boolean;
}

/**
 * Estimate token count using character-based heuristic.
 * ASCII: ~4 chars/token, non-ASCII (CJK etc): ~1.5 tokens/char.
 * Same algorithm as the CLI's contextCommand.ts.
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  let asciiChars = 0;
  let nonAsciiChars = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) {
      asciiChars++;
    } else {
      nonAsciiChars++;
    }
  }
  return Math.ceil(asciiChars / 4 + nonAsciiChars * 1.5);
}

/**
 * Calculate full context usage breakdown from messages and token data.
 */
export function calculateContextBreakdown(
  messages: AllMessage[],
  promptTokens: number,
  contextWindowSize: number,
  modelName: string,
  cacheReadInputTokens?: number,
): ContextUsageData {
  const COMPRESSION_THRESHOLD = 0.7;
  const autocompactBuffer = Math.round(
    (1 - COMPRESSION_THRESHOLD) * contextWindowSize,
  );

  // Estimate message tokens by category
  const messageBreakdown: MessageBreakdown = {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    thinking: 0,
  };

  for (const msg of messages) {
    if (msg.type === "chat" && (msg as ChatMessage).role === "user") {
      messageBreakdown.userMessages += estimateTokens(
        (msg as ChatMessage).content,
      );
    } else if (msg.type === "chat" && (msg as ChatMessage).role === "assistant") {
      messageBreakdown.assistantMessages += estimateTokens(
        (msg as ChatMessage).content,
      );
    } else if (msg.type === "tool" || msg.type === "tool_result") {
      messageBreakdown.toolCalls += estimateTokens(
        (msg as ToolMessage | ToolResultMessage).content,
      );
    } else if (msg.type === "thinking") {
      messageBreakdown.thinking += estimateTokens(
        (msg as ThinkingMessage).content,
      );
    }
  }

  const estimatedMessages =
    messageBreakdown.userMessages +
    messageBreakdown.assistantMessages +
    messageBreakdown.toolCalls +
    messageBreakdown.thinking;

  // Use cache data if available for more accurate overhead
  const hasCacheData =
    cacheReadInputTokens !== undefined && cacheReadInputTokens > 0;
  const overhead = hasCacheData
    ? cacheReadInputTokens!
    : Math.max(0, promptTokens - estimatedMessages);
  const msgTokens = hasCacheData
    ? Math.max(0, promptTokens - cacheReadInputTokens!)
    : estimatedMessages;

  const freeSpace = Math.max(
    0,
    contextWindowSize - promptTokens - autocompactBuffer,
  );

  const percentage =
    contextWindowSize > 0 ? (promptTokens / contextWindowSize) * 100 : 0;

  return {
    totalTokens: promptTokens,
    contextWindowSize,
    modelName,
    percentage,
    breakdown: {
      overhead,
      messages: msgTokens,
      freeSpace,
      autocompactBuffer,
    },
    messageBreakdown,
    hasCacheData,
  };
}

/**
 * Check if a message is a result message with usage data
 */
function isResultMessageWithUsage(
  message: AllMessage,
): message is SystemMessage & { type: "result"; usage: ExtendedUsage } {
  return (
    message.type === "result" &&
    "usage" in message &&
    typeof message.usage === "object"
  );
}

/**
 * Calculate token usage from the latest result message
 * Uses prompt_tokens (current request's input tokens) instead of accumulated tokens
 * This matches the context window calculation used by the API
 *
 * @param messages Array of all messages in the conversation
 * @returns TokenUsageInfo with current prompt token count
 */
export function calculateTokenUsage(messages: AllMessage[]): TokenUsageInfo {
  let promptTokens = 0;
  let outputTokens = 0;

  // Find the latest result message with usage data
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (isResultMessageWithUsage(message)) {
      const usage = message.usage;
      // Use prompt_tokens (input_tokens) from the latest message
      // This represents the current request's prompt tokens, not accumulated
      promptTokens = usage.input_tokens || 0;
      outputTokens = usage.output_tokens || 0;

      break; // Only use the latest result message
    }
  }

  return {
    promptTokens,
    outputTokens,
    totalTokens: promptTokens, // Use promptTokens as total for context window calculation
  };
}

/**
 * Format token count for display
 * Uses locale-aware formatting for thousands separator
 *
 * @param count Token count
 * @returns Formatted string (e.g., "3,500")
 */
export function formatTokenCount(count: number): string {
  return count.toLocaleString();
}

/**
 * Format token usage ratio for display
 * Shows used/total format with optional percentage
 *
 * @param usedTokens Number of tokens used
 * @param contextWindow Context window size (total available)
 * @returns Formatted string (e.g., "3,500 / 128,000" or "3,500 / 128,000 (2.7%)")
 */
export function formatTokenRatio(
  usedTokens: number,
  contextWindow: number | undefined,
): string {
  if (!contextWindow || contextWindow <= 0) {
    return formatTokenCount(usedTokens);
  }

  const percentage = ((usedTokens / contextWindow) * 100).toFixed(1);
  return `${formatTokenCount(usedTokens)} / ${formatTokenCount(contextWindow)} (${percentage}%)`;
}