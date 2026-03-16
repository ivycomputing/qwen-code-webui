/**
 * Message Adapter for @qwen-code/webui
 *
 * Converts internal message types to the ChatMessageData format
 * required by the @qwen-code/webui ChatViewer component.
 */

import type {
  AllMessage,
  ChatMessage,
  ToolResultMessage,
  ThinkingMessage,
  PlanMessage,
  TodoMessage,
  SystemMessage,
} from "../types";
import type {
  ChatMessageData,
  ToolCallData,
} from "@qwen-code/webui";

/**
 * Extended message type for internal use
 * Includes types not directly supported by ChatViewer
 */
export type ExtendedMessageType =
  | "user"
  | "assistant"
  | "tool_call"
  | "thinking"
  | "system"
  | "result"
  | "error"
  | "plan"
  | "todo";

/**
 * Extended message format for internal processing
 * Contains both ChatMessageData and additional metadata
 */
export interface ExtendedMessage extends ChatMessageData {
  /** Whether this is the first item in an AI response sequence */
  isFirst: boolean;
  /** Whether this is the last item in an AI response sequence */
  isLast: boolean;
  /** Original message for reference */
  original: AllMessage;
  /** Extended type for internal use */
  extendedType: ExtendedMessageType;
  /** Additional data for special types */
  data?: {
    plan?: string;
    todos?: TodoMessage["todos"];
    systemData?: Record<string, unknown>;
  };
}

/**
 * Generate a unique ID for a message
 */
function generateMessageId(message: AllMessage, index: number): string {
  if ("session_id" in message && message.session_id) {
    return `${message.session_id}-${message.timestamp}`;
  }
  return `msg-${index}-${message.timestamp}`;
}

/**
 * Check if a message is a user type (breaks AI sequence)
 */
function isUserType(msg: AllMessage | undefined): boolean {
  if (!msg) return true;
  if (msg.type === "chat" && msg.role === "user") return true;
  return false;
}

/**
 * Convert timestamp to ISO string
 */
function toISOString(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Convert ToolResultMessage to ToolCallData format for webui
 */
function convertToolResultToToolCall(
  message: ToolResultMessage,
): ToolCallData | undefined {
  // Map tool names to webui kind format
  const kindMap: Record<string, string> = {
    Read: "read",
    Write: "write",
    Edit: "edit",
    Bash: "bash",
    Execute: "execute",
    Grep: "search",
    Glob: "search",
    WebFetch: "fetch",
    Think: "think",
    TodoWrite: "todo_write",
    SaveMemory: "save_memory",
  };

  const kind = kindMap[message.toolName] || message.toolName.toLowerCase();

  return {
    toolCallId: `tool-${message.timestamp}`,
    kind,
    title: message.toolName,
    status: "completed" as const,
    rawInput: message.toolUseResult,
    content: [
      {
        type: "content",
        content: {
          type: "text",
          text: message.content,
        },
      },
    ],
    timestamp: message.timestamp,
  };
}

/**
 * Adapt internal messages to ChatMessageData format for webui components
 *
 * @param messages - Array of internal messages
 * @returns Array of ChatMessageData messages with timeline positions calculated
 */
export function adaptMessagesToWebUI(
  messages: AllMessage[],
): ExtendedMessage[] {
  return messages.map((msg, index, arr) => {
    const prev = arr[index - 1];
    const next = arr[index + 1];

    // Calculate timeline position
    const isFirst = isUserType(prev);
    const isLast = isUserType(next);

    const id = generateMessageId(msg, index);
    const timestamp = toISOString(msg.timestamp);

    // Handle different message types
    switch (msg.type) {
      case "chat": {
        const isUser = msg.role === "user";
        return {
          uuid: id,
          timestamp,
          type: isUser ? "user" : "assistant",
          message: {
            role: msg.role,
            content: msg.content,
          },
          isFirst,
          isLast,
          original: msg,
          extendedType: isUser ? "user" : "assistant",
        };
      }

      case "thinking":
        return {
          uuid: id,
          timestamp,
          type: "assistant",
          message: {
            role: "thinking",
            content: msg.content,
          },
          isFirst,
          isLast,
          original: msg,
          extendedType: "thinking",
        };

      case "tool_result":
        return {
          uuid: id,
          timestamp,
          type: "tool_call",
          toolCall: convertToolResultToToolCall(msg),
          message: {
            content: msg.content,
          },
          isFirst,
          isLast,
          original: msg,
          extendedType: "tool_call",
        };

      case "plan":
        return {
          uuid: id,
          timestamp,
          type: "assistant",
          message: {
            role: "assistant",
            content: msg.plan,
          },
          isFirst,
          isLast,
          original: msg,
          extendedType: "plan",
          data: {
            plan: msg.plan,
          },
        };

      case "todo": {
        // Convert TodoMessage to ToolCallData format for UpdatedPlanToolCall
        const todoToolCall: ToolCallData = {
          toolCallId: `todo-${msg.timestamp}`,
          kind: "todo_write",
          title: "Todo List",
          status: "completed" as const,
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: msg.todos
                  .map((todo) => {
                    const checkbox =
                      todo.status === "completed"
                        ? "[x]"
                        : todo.status === "in_progress"
                          ? "[-]"
                          : "[ ]";
                    return `- ${checkbox} ${todo.content}`;
                  })
                  .join("\n"),
              },
            },
          ],
          timestamp: msg.timestamp,
        };

        return {
          uuid: id,
          timestamp,
          type: "tool_call",
          toolCall: todoToolCall,
          message: {
            role: "assistant",
            content: JSON.stringify(msg.todos),
          },
          isFirst,
          isLast,
          original: msg,
          extendedType: "todo",
          data: {
            todos: msg.todos,
          },
        };
      }

      case "system":
      case "result":
      case "error": {
        const content =
          "message" in msg
            ? typeof msg.message === "string"
              ? msg.message
              : JSON.stringify(msg)
            : JSON.stringify(msg);
        return {
          uuid: id,
          timestamp,
          type: "system",
          message: {
            content,
          },
          isFirst,
          isLast,
          original: msg,
          extendedType: msg.type,
          data: {
            systemData: msg as Record<string, unknown>,
          },
        };
      }

      case "tool":
        return {
          uuid: id,
          timestamp,
          type: "tool_call",
          message: {
            content: msg.content,
          },
          isFirst,
          isLast,
          original: msg,
          extendedType: "tool_call",
        };

      default:
        return {
          uuid: id,
          timestamp,
          type: "assistant",
          message: {
            content: JSON.stringify(msg),
          },
          isFirst,
          isLast,
          original: msg,
          extendedType: "assistant",
        };
    }
  });
}

/**
 * Filter out empty messages (except tool calls)
 */
export function filterEmptyMessages(
  messages: ExtendedMessage[],
): ExtendedMessage[] {
  return messages.filter((msg) => {
    if (msg.type === "tool_call") return true;
    if (msg.extendedType === "plan" || msg.extendedType === "todo") return true;
    const content = msg.message?.content;
    if (typeof content === "string") {
      return content.trim().length > 0;
    }
    return false;
  });
}

/**
 * Type guard to check if a message is an ExtendedMessage
 */
export function isExtendedMessage(
  message: unknown,
): message is ExtendedMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "uuid" in message &&
    "type" in message &&
    "timestamp" in message &&
    "extendedType" in message
  );
}

/**
 * Check if an extended message is a plan type
 */
export function isPlanMessage(msg: ExtendedMessage): boolean {
  return msg.extendedType === "plan";
}

/**
 * Check if an extended message is a todo type
 */
export function isTodoMessage(msg: ExtendedMessage): boolean {
  return msg.extendedType === "todo";
}

/**
 * Check if an extended message is a thinking type
 */
export function isThinkingMessage(msg: ExtendedMessage): boolean {
  return msg.extendedType === "thinking";
}

/**
 * Re-export types for convenience
 */
export type { ToolCallData, ChatMessageData };