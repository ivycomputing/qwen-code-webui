import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStreamParser } from "./useStreamParser";
import type { StreamingContext } from "./useMessageProcessor";
import { generateId } from "../../utils/id";

// Mock dependencies

describe("useStreamParser", () => {
  let mockContext: StreamingContext;

  beforeEach(() => {
    mockContext = {
      addMessage: vi.fn(),
      updateLastMessage: vi.fn(),
      setCurrentAssistantMessage: vi.fn(),
      currentAssistantMessage: null,
      onSessionId: vi.fn(),
      hasReceivedInit: false,
      setHasReceivedInit: vi.fn(),
      shouldShowInitMessage: vi.fn(() => true),
      onInitMessageShown: vi.fn(),
    };

    vi.clearAllMocks();
  });

  describe("ExitPlanMode Detection and Plan Message Creation", () => {
    it("should detect ExitPlanMode tool use and create plan message", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "test-session",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "tool_use" as const,
              id: "plan-123",
              name: "ExitPlanMode",
              input: {
                plan: "Let's implement a new feature:\n\n1. Add UI component\n2. Connect to API\n3. Write tests",
              },
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "plan",
          plan: "Let's implement a new feature:\n\n1. Add UI component\n2. Connect to API\n3. Write tests",
          toolUseId: "plan-123",
          timestamp: expect.any(Number),
        }),
      );
    });

    it("should handle ExitPlanMode with empty plan content", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "test-session",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "tool_use" as const,
              id: "plan-456",
              name: "ExitPlanMode",
              input: {},
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "plan",
          plan: "",
          toolUseId: "plan-456",
          timestamp: expect.any(Number),
        }),
      );
    });

    it("should handle ExitPlanMode with missing input field", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "test-session",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "tool_use" as const,
              id: "plan-789",
              name: "ExitPlanMode",
              input: {},
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "plan",
          plan: "",
          toolUseId: "plan-789",
          timestamp: expect.any(Number),
        }),
      );
    });

    it("should handle ExitPlanMode with missing toolUseId", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "test-session",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "tool_use" as const,
              id: "",
              name: "ExitPlanMode",
              input: {
                plan: "Test plan content",
              },
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "plan",
          plan: "Test plan content",
          toolUseId: "",
          timestamp: expect.any(Number),
        }),
      );
    });

    it("should handle non-string plan content gracefully", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "test-session",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "tool_use" as const,
              id: "plan-invalid",
              name: "ExitPlanMode",
              input: {
                plan: { invalid: "object" }, // Non-string content
              },
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "plan",
          plan: { invalid: "object" },
          toolUseId: "plan-invalid",
          timestamp: expect.any(Number),
        }),
      );
    });

    it("should not create plan message for non-ExitPlanMode tools", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "test-session",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "tool_use" as const,
              id: "bash-123",
              name: "Bash",
              input: {
                command: "ls -la",
              },
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      // Should create a regular tool message, not a plan message
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        }),
      );

      // Verify it's not a plan message
      const addedMessage = (
        mockContext.addMessage as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0][0] as { type: string };
      expect(addedMessage.type).not.toBe("plan");
    });
  });

  describe("Stream Line Processing and Error Handling", () => {
    it("should handle malformed JSON gracefully", () => {
      const { result } = renderHook(() => useStreamParser());
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      result.current.processStreamLine("invalid json", mockContext);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to parse stream line:",
        expect.any(Error),
      );
      expect(mockContext.addMessage).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle missing data field in claude_json", () => {
      const { result } = renderHook(() => useStreamParser());

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          // data field is missing
        }),
        mockContext,
      );

      expect(mockContext.addMessage).not.toHaveBeenCalled();
    });

    it("should handle error stream responses", () => {
      const { result } = renderHook(() => useStreamParser());

      result.current.processStreamLine(
        JSON.stringify({
          type: "error",
          error: "Qwen execution failed",
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        type: "error",
        subtype: "stream_error",
        message: "Qwen execution failed",
        timestamp: expect.any(Number),
      });
    });

    it("should handle error stream responses with missing error message", () => {
      const { result } = renderHook(() => useStreamParser());

      result.current.processStreamLine(
        JSON.stringify({
          type: "error",
          // error field is missing
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        type: "error",
        subtype: "stream_error",
        message: "Unknown error",
        timestamp: expect.any(Number),
      });
    });

    it("should handle aborted stream responses", () => {
      const { result } = renderHook(() => useStreamParser());

      result.current.processStreamLine(
        JSON.stringify({
          type: "aborted",
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        type: "system",
        subtype: "abort",
        message: "Operation was aborted by user",
        timestamp: expect.any(Number),
      });
      expect(mockContext.setCurrentAssistantMessage).toHaveBeenCalledWith(null);
    });
  });

  describe("Mixed Content Handling", () => {
    it("should handle assistant message with both text and ExitPlanMode tool use", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "test-session",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "text" as const,
              text: "I'll help you with that. Here's my plan:",
            },
            {
              type: "tool_use" as const,
              id: "plan-mixed",
              name: "ExitPlanMode",
              input: {
                plan: "1. Analyze requirements\n2. Design solution\n3. Implement",
              },
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      // Should create/update assistant text message and add plan message
      expect(mockContext.addMessage).toHaveBeenCalledTimes(2);
      expect(mockContext.updateLastMessage).toHaveBeenCalledWith(
        "I'll help you with that. Here's my plan:",
      );
      expect(mockContext.addMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: "plan",
          plan: "1. Analyze requirements\n2. Design solution\n3. Implement",
          toolUseId: "plan-mixed",
        }),
      );
    });

    it("should handle multiple tool uses including ExitPlanMode", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "test-session",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "tool_use" as const,
              id: "bash-123",
              name: "Bash",
              input: { command: "ls" },
            },
            {
              type: "tool_use" as const,
              id: "plan-multi",
              name: "ExitPlanMode",
              input: { plan: "Multi-tool plan" },
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      expect(mockContext.addMessage).toHaveBeenCalledTimes(2);

      // First call should be the regular tool
      expect(mockContext.addMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          timestamp: expect.any(Number),
        }),
      );

      // Second call should be the plan
      expect(mockContext.addMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: "plan",
          plan: "Multi-tool plan",
          toolUseId: "plan-multi",
        }),
      );
    });
  });

  describe("Session ID Handling with Plan Mode", () => {
    it("should update session ID when processing assistant message with ExitPlanMode", () => {
      const { result } = renderHook(() => useStreamParser());
      mockContext.hasReceivedInit = true;

      const assistantMessage = {
        type: "assistant" as const,
        session_id: "session-with-plan",
        uuid: generateId(),
        parent_tool_use_id: null,
        message: {
          id: "msg_" + generateId(),
          type: "message" as const,
          role: "assistant" as const,
          model: "qwen3-coder-plus",
          content: [
            {
              type: "tool_use" as const,
              id: "plan-session",
              name: "ExitPlanMode",
              input: { plan: "Plan with session tracking" },
            },
          ],
          stop_reason: "tool_use" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      expect(mockContext.onSessionId).toHaveBeenCalledWith("session-with-plan");
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "plan",
          plan: "Plan with session tracking",
        }),
      );
    });
  });

  describe("Qwen SDK tool_result message type", () => {
    it("should process top-level tool_result messages (Qwen SDK format)", () => {
      const { result } = renderHook(() => useStreamParser());

      const toolResultMessage = {
        type: "tool_result",
        message: {
          role: "user",
          parts: [
            {
              functionResponse: {
                id: "tool-abc123",
                name: "grep_search",
                response: { output: "Found 5 matches" },
              },
            },
          ],
        },
        toolCallResult: {
          callId: "tool-abc123",
          status: "success",
          resultDisplay: "Found 5 matches",
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: toolResultMessage,
        }),
        mockContext,
      );

      // Should have processed the tool_result and added a tool_result message
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tool_result",
          toolName: "grep_search",
        }),
      );
    });

    it("should process assistant message with functionCall in parts", () => {
      const { result } = renderHook(() => useStreamParser());

      const assistantMessage = {
        type: "assistant",
        message: {
          role: "model",
          parts: [
            { text: "Let me search." },
            {
              functionCall: {
                id: "fc-test-1",
                name: "grep_search",
                args: { pattern: "TODO" },
              },
            },
          ],
        },
      };

      result.current.processStreamLine(
        JSON.stringify({
          type: "claude_json",
          data: assistantMessage,
        }),
        mockContext,
      );

      // Should have text + tool message
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tool",
          content: expect.stringContaining("grep_search"),
        }),
      );
    });
  });
});
