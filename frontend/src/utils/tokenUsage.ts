import type { AllMessage, SystemMessage } from "../types";
import type { ExtendedUsage } from "@qwen-code/sdk";

/**
 * Token usage information for display in the status bar
 */
export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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
 * Calculate total token usage from all messages
 * Accumulates input_tokens and output_tokens from result messages
 *
 * @param messages Array of all messages in the conversation
 * @returns TokenUsageInfo with accumulated token counts
 */
export function calculateTokenUsage(messages: AllMessage[]): TokenUsageInfo {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const message of messages) {
    if (isResultMessageWithUsage(message)) {
      const usage = message.usage;
      inputTokens += usage.input_tokens || 0;
      outputTokens += usage.output_tokens || 0;

      // Also count cache tokens as part of input
      if (usage.cache_creation_input_tokens) {
        inputTokens += usage.cache_creation_input_tokens;
      }
      if (usage.cache_read_input_tokens) {
        inputTokens += usage.cache_read_input_tokens;
      }
    }
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
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