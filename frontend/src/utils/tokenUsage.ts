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
  /** Number of messages per category */
  counts: {
    user: number;
    assistant: number;
    tool: number;
    thinking: number;
  };
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

  // Estimate message tokens by category and count messages
  const messageBreakdown: MessageBreakdown = {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    thinking: 0,
    counts: { user: 0, assistant: 0, tool: 0, thinking: 0 },
  };

  for (const msg of messages) {
    if (msg.type === "chat" && (msg as ChatMessage).role === "user") {
      messageBreakdown.userMessages += estimateTokens(
        (msg as ChatMessage).content,
      );
      messageBreakdown.counts.user++;
    } else if (msg.type === "chat" && (msg as ChatMessage).role === "assistant") {
      messageBreakdown.assistantMessages += estimateTokens(
        (msg as ChatMessage).content,
      );
      messageBreakdown.counts.assistant++;
    } else if (msg.type === "tool" || msg.type === "tool_result") {
      messageBreakdown.toolCalls += estimateTokens(
        (msg as ToolMessage | ToolResultMessage).content,
      );
      messageBreakdown.counts.tool++;
    } else if (msg.type === "thinking") {
      messageBreakdown.thinking += estimateTokens(
        (msg as ThinkingMessage).content,
      );
      messageBreakdown.counts.thinking++;
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

  // Scale sub-categories proportionally so they sum to the accurate msgTokens
  if (hasCacheData && estimatedMessages > 0 && msgTokens !== estimatedMessages) {
    const scaleFactor = msgTokens / estimatedMessages;
    messageBreakdown.userMessages = Math.round(
      messageBreakdown.userMessages * scaleFactor,
    );
    messageBreakdown.assistantMessages = Math.round(
      messageBreakdown.assistantMessages * scaleFactor,
    );
    messageBreakdown.toolCalls = Math.round(
      messageBreakdown.toolCalls * scaleFactor,
    );
    messageBreakdown.thinking = Math.round(
      messageBreakdown.thinking * scaleFactor,
    );

    // Fix rounding error: adjust the largest category
    const scaledSum =
      messageBreakdown.userMessages +
      messageBreakdown.assistantMessages +
      messageBreakdown.toolCalls +
      messageBreakdown.thinking;
    const diff = Math.round(msgTokens) - scaledSum;
    if (diff !== 0) {
      const categories: (keyof Omit<MessageBreakdown, "counts">)[] = [
        "userMessages",
        "assistantMessages",
        "toolCalls",
        "thinking",
      ];
      const largest = categories.reduce((a, b) =>
        messageBreakdown[a] >= messageBreakdown[b] ? a : b,
      );
      messageBreakdown[largest] += diff;
    }
  }

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
 * Calculate token usage from messages using three-level fallback:
 * 1. Latest assistant ChatMessage with per-request usage (accurate, from API)
 * 2. Latest result message usage (accumulated, used as fallback for DB reconnect etc.)
 * 3. Zero
 *
 * @param messages Array of all messages in the conversation
 * @returns TokenUsageInfo with current prompt token count
 */
export function calculateTokenUsage(messages: AllMessage[]): TokenUsageInfo {
  let promptTokens = 0;
  let outputTokens = 0;

  // Priority 1: per-request usage from latest assistant ChatMessage
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.type === "chat" &&
      (message as ChatMessage).role === "assistant" &&
      (message as ChatMessage).usage
    ) {
      const usage = (message as ChatMessage).usage!;
      promptTokens = usage.input_tokens || 0;
      outputTokens = usage.output_tokens || 0;
      break;
    }
  }

  // Priority 2: fallback to result message (accumulated, but better than zero)
  if (promptTokens === 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (isResultMessageWithUsage(msg)) {
        promptTokens = msg.usage.input_tokens || 0;
        outputTokens = msg.usage.output_tokens || 0;
        break;
      }
    }
  }

  return {
    promptTokens,
    outputTokens,
    totalTokens: promptTokens,
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