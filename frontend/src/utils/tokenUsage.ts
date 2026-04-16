import type { AllMessage, SystemMessage } from "../types";
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