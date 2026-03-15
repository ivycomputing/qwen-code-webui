import type { SDKMessage, ThinkingContentItem } from "../types";

// Type guard functions for SDKMessage (Qwen SDK compatible)
export function isSystemMessage(
  data: SDKMessage,
): data is Extract<SDKMessage, { type: "system" }> {
  return data.type === "system";
}

export function isAssistantMessage(
  data: SDKMessage,
): data is Extract<SDKMessage, { type: "assistant" }> {
  return data.type === "assistant";
}

export function isResultMessage(
  data: SDKMessage,
): data is Extract<SDKMessage, { type: "result" }> {
  return data.type === "result";
}

export function isUserMessage(
  data: SDKMessage,
): data is Extract<SDKMessage, { type: "user" }> {
  return data.type === "user";
}

// Qwen SDK specific: stream_event type for partial messages
export function isStreamEventMessage(
  data: SDKMessage,
): data is Extract<SDKMessage, { type: "stream_event" }> {
  return data.type === "stream_event";
}

// Type guard for thinking content items
export function isThinkingContentItem(
  item: unknown,
): item is ThinkingContentItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    item.type === "thinking" &&
    "thinking" in item &&
    typeof item.thinking === "string"
  );
}
