/**
 * Tests for MessageAdapter
 */

import { describe, it, expect } from "vitest";
import {
  adaptMessagesToWebUI,
  filterEmptyMessages,
  isExtendedMessage,
  isPlanMessage,
  isTodoMessage,
  isThinkingMessage,
} from "./MessageAdapter";
import type { AllMessage, ChatMessage, ToolResultMessage, TodoMessage } from "../types";

describe("MessageAdapter", () => {
  describe("adaptMessagesToWebUI", () => {
    it("should convert chat messages correctly", () => {
      const messages: AllMessage[] = [
        {
          type: "chat",
          role: "user",
          content: "Hello, world!",
          timestamp: 1000,
        },
        {
          type: "chat",
          role: "assistant",
          content: "Hi there!",
          timestamp: 2000,
        },
      ];

      const result = adaptMessagesToWebUI(messages);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("user");
      expect(result[0].message?.content).toBe("Hello, world!");
      expect(result[0].extendedType).toBe("user");
      expect(result[0].isFirst).toBe(true); // First message
      expect(result[0].isLast).toBe(false); // Next is assistant, not user

      expect(result[1].type).toBe("assistant");
      expect(result[1].message?.content).toBe("Hi there!");
      expect(result[1].extendedType).toBe("assistant");
      expect(result[1].isFirst).toBe(true); // After user message, starts new sequence
      expect(result[1].isLast).toBe(true); // Last message (no next message)
    });

    it("should convert tool result messages correctly", () => {
      const messages: AllMessage[] = [
        {
          type: "tool_result",
          toolName: "Read",
          content: "file contents",
          summary: "Read file.txt",
          timestamp: 1000,
        },
      ];

      const result = adaptMessagesToWebUI(messages);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("tool_call");
      expect(result[0].toolCall).toBeDefined();
      expect(result[0].toolCall?.kind).toBe("read");
      expect(result[0].toolCall?.status).toBe("completed");
    });

    it("should convert todo messages to tool_call format", () => {
      const messages: AllMessage[] = [
        {
          type: "todo",
          todos: [
            { content: "Task 1", status: "completed", activeForm: "Doing task 1" },
            { content: "Task 2", status: "in_progress", activeForm: "Doing task 2" },
            { content: "Task 3", status: "pending", activeForm: "Doing task 3" },
          ],
          timestamp: 1000,
        },
      ];

      const result = adaptMessagesToWebUI(messages);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("tool_call");
      expect(result[0].toolCall).toBeDefined();
      expect(result[0].toolCall?.kind).toBe("todo_write");
      expect(result[0].extendedType).toBe("todo");
      
      // Check the todo text format
      const todoText = result[0].toolCall?.content?.[0]?.content?.text;
      expect(todoText).toContain("[x] Task 1");
      expect(todoText).toContain("[-] Task 2");
      expect(todoText).toContain("[ ] Task 3");
    });

    it("should convert thinking messages correctly", () => {
      const messages: AllMessage[] = [
        {
          type: "thinking",
          content: "Let me think about this...",
          timestamp: 1000,
        },
      ];

      const result = adaptMessagesToWebUI(messages);

      expect(result).toHaveLength(1);
      expect(result[0].extendedType).toBe("thinking");
      expect(result[0].message?.content).toBe("Let me think about this...");
    });

    it("should convert plan messages correctly", () => {
      const messages: AllMessage[] = [
        {
          type: "plan",
          plan: "1. Do this\n2. Do that",
          toolUseId: "tool-123",
          timestamp: 1000,
        },
      ];

      const result = adaptMessagesToWebUI(messages);

      expect(result).toHaveLength(1);
      expect(result[0].extendedType).toBe("plan");
      expect(result[0].data?.plan).toBe("1. Do this\n2. Do that");
    });

    it("should calculate isFirst and isLast correctly", () => {
      const messages: AllMessage[] = [
        {
          type: "chat",
          role: "user",
          content: "User message",
          timestamp: 1000,
        },
        {
          type: "thinking",
          content: "Thinking...",
          timestamp: 2000,
        },
        {
          type: "chat",
          role: "assistant",
          content: "Assistant message",
          timestamp: 3000,
        },
        {
          type: "chat",
          role: "user",
          content: "Another user message",
          timestamp: 4000,
        },
      ];

      const result = adaptMessagesToWebUI(messages);

      // First user message
      expect(result[0].isFirst).toBe(true);
      expect(result[0].isLast).toBe(false); // Next is thinking, not user

      // Thinking message (part of assistant response)
      expect(result[1].isFirst).toBe(true); // Starts new AI sequence after user
      expect(result[1].isLast).toBe(false); // Next is assistant, not user

      // Assistant message (continues AI sequence)
      expect(result[2].isFirst).toBe(false);
      expect(result[2].isLast).toBe(true); // Next is user message

      // Second user message
      expect(result[3].isFirst).toBe(false); // Previous is assistant, not user
      expect(result[3].isLast).toBe(true); // Last message (no next)
    });
  });

  describe("filterEmptyMessages", () => {
    it("should filter out empty messages", () => {
      const messages = adaptMessagesToWebUI([
        {
          type: "chat",
          role: "user",
          content: "Hello",
          timestamp: 1000,
        },
        {
          type: "chat",
          role: "assistant",
          content: "",
          timestamp: 2000,
        },
        {
          type: "chat",
          role: "assistant",
          content: "   ",
          timestamp: 3000,
        },
        {
          type: "chat",
          role: "user",
          content: "World",
          timestamp: 4000,
        },
      ]);

      const filtered = filterEmptyMessages(messages);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].message?.content).toBe("Hello");
      expect(filtered[1].message?.content).toBe("World");
    });

    it("should keep tool_call messages even with empty content", () => {
      const messages = adaptMessagesToWebUI([
        {
          type: "tool_result",
          toolName: "Read",
          content: "",
          summary: "Read file",
          timestamp: 1000,
        },
      ]);

      const filtered = filterEmptyMessages(messages);

      expect(filtered).toHaveLength(1);
    });

    it("should keep plan and todo messages", () => {
      const messages = adaptMessagesToWebUI([
        {
          type: "plan",
          plan: "My plan",
          toolUseId: "tool-1",
          timestamp: 1000,
        },
        {
          type: "todo",
          todos: [{ content: "Task", status: "pending", activeForm: "Doing task" }],
          timestamp: 2000,
        },
      ]);

      const filtered = filterEmptyMessages(messages);

      expect(filtered).toHaveLength(2);
    });
  });

  describe("type guards", () => {
    it("should identify extended messages", () => {
      const messages = adaptMessagesToWebUI([
        {
          type: "chat",
          role: "user",
          content: "Hello",
          timestamp: 1000,
        },
      ]);

      expect(isExtendedMessage(messages[0])).toBe(true);
      expect(isExtendedMessage(null)).toBe(false);
      expect(isExtendedMessage({})).toBe(false);
    });

    it("should identify plan messages", () => {
      const messages = adaptMessagesToWebUI([
        {
          type: "plan",
          plan: "My plan",
          toolUseId: "tool-1",
          timestamp: 1000,
        },
      ]);

      expect(isPlanMessage(messages[0])).toBe(true);
    });

    it("should identify todo messages", () => {
      const messages = adaptMessagesToWebUI([
        {
          type: "todo",
          todos: [{ content: "Task", status: "pending", activeForm: "Doing task" }],
          timestamp: 1000,
        },
      ]);

      expect(isTodoMessage(messages[0])).toBe(true);
    });

    it("should identify thinking messages", () => {
      const messages = adaptMessagesToWebUI([
        {
          type: "thinking",
          content: "Thinking...",
          timestamp: 1000,
        },
      ]);

      expect(isThinkingMessage(messages[0])).toBe(true);
    });
  });
});