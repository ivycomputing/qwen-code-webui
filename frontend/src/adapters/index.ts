/**
 * Adapters for @qwen-code/webui integration
 *
 * This module provides adapters to convert internal message formats
 * to the formats required by the @qwen-code/webui component library.
 */

export {
  adaptMessagesToWebUI,
  filterEmptyMessages,
  isExtendedMessage,
  isPlanMessage,
  isTodoMessage,
  isThinkingMessage,
  type ExtendedMessage,
  type ExtendedMessageType,
  type ToolCallData,
  type ChatMessageData,
} from "./MessageAdapter";