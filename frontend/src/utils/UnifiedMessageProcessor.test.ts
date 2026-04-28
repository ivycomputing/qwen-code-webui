import { describe, it, expect } from "vitest";
import {
  UnifiedMessageProcessor,
  type ProcessingContext,
} from "./UnifiedMessageProcessor";
import type { CommandLoopRequest } from "../hooks/chat/usePermissions";

describe("UnifiedMessageProcessor - Loop Detection Integration", () => {
  function createProcessor() {
    return new UnifiedMessageProcessor();
  }

  function createMockContext(
    overrides: Partial<ProcessingContext> = {},
  ): ProcessingContext {
    return {
      addMessage: () => {},
      updateLastMessage: () => {},
      setCurrentAssistantMessage: () => {},
      setHasReceivedInit: () => {},
      ...overrides,
    };
  }

  /**
   * Helper: send assistant message with tool_use using Claude content format
   * (This is the format that populates the tool_use cache)
   */
  function sendToolUse(
    processor: UnifiedMessageProcessor,
    context: ProcessingContext,
    toolUseId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ) {
    processor.processMessage(
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: toolUseId,
              name: toolName,
              input: toolInput,
            },
          ],
        },
      } as any,
      context,
      { isStreaming: true },
    );
  }

  /**
   * Helper: send user message with tool_result (is_error)
   */
  function sendErrorToolResult(
    processor: UnifiedMessageProcessor,
    context: ProcessingContext,
    toolUseId: string,
    content: string,
  ) {
    processor.processMessage(
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUseId,
              content,
              is_error: true,
            },
          ],
        },
      } as any,
      context,
      { isStreaming: true },
    );
  }

  /**
   * Helper: send user message with tool_result (NOT is_error)
   */
  function sendToolResult(
    processor: UnifiedMessageProcessor,
    context: ProcessingContext,
    toolUseId: string,
    content: string,
  ) {
    processor.processMessage(
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUseId,
              content,
            },
          ],
        },
      } as any,
      context,
      { isStreaming: true },
    );
  }

  describe("Auto-rejection loop detection (is_error tool results)", () => {
    it("should call onAutoRejection when is_error tool_result arrives", () => {
      const processor = createProcessor();
      const autoRejectionCalls: Array<{
        toolName: string;
        content: string;
      }> = [];

      const context = createMockContext({
        onAutoRejection: (toolName, content) => {
          autoRejectionCalls.push({ toolName, content });
          return null;
        },
        onPermissionError: () => {},
        onAbortRequest: () => {},
      });

      sendToolUse(processor, context, "tool-auto-1", "run_shell_command", {
        command: "ssh test",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-auto-1",
        "[Operation Cancelled] Reason: Error: Input closed",
      );

      expect(autoRejectionCalls).toHaveLength(1);
      expect(autoRejectionCalls[0].toolName).toBe("run_shell_command");
      expect(autoRejectionCalls[0].content).toContain("Input closed");
    });

    it("should show loop dialog instead of permission dialog when auto-rejection loop detected", () => {
      const processor = createProcessor();
      let permissionErrorCalled = false;
      let loopRequestShown: CommandLoopRequest | null = null;

      const context = createMockContext({
        onAutoRejection: (toolName, content) => {
          return {
            isOpen: true,
            toolName,
            command: toolName,
            errorOutput: content.substring(0, 200),
          };
        },
        onShowCommandLoopRequest: (request) => {
          loopRequestShown = request;
        },
        onPermissionError: () => {
          permissionErrorCalled = true;
        },
        onAbortRequest: () => {},
      });

      sendToolUse(processor, context, "tool-loop-1", "run_shell_command", {
        command: "ssh test",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-loop-1",
        "[Operation Cancelled] Reason: Error: Input closed",
      );

      expect(loopRequestShown).not.toBeNull();
      expect(loopRequestShown!.toolName).toBe("run_shell_command");
      expect(permissionErrorCalled).toBe(false);
    });

    it("should show permission dialog when no auto-rejection loop", () => {
      const processor = createProcessor();
      let permissionErrorCalled = false;
      let loopRequestShown = false;

      const context = createMockContext({
        onAutoRejection: () => null,
        onShowCommandLoopRequest: () => {
          loopRequestShown = true;
        },
        onPermissionError: () => {
          permissionErrorCalled = true;
        },
        onAbortRequest: () => {},
      });

      sendToolUse(processor, context, "tool-noloop-1", "run_shell_command", {
        command: "ls",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-noloop-1",
        "[Operation Cancelled] Reason: Error: Input closed",
      );

      expect(permissionErrorCalled).toBe(true);
      expect(loopRequestShown).toBe(false);
    });

    it("should not trigger auto-rejection for tool_use_error", () => {
      const processor = createProcessor();
      let autoRejectionCalled = false;

      const context = createMockContext({
        onAutoRejection: () => {
          autoRejectionCalled = true;
          return null;
        },
        onPermissionError: () => {},
        onAbortRequest: () => {},
      });

      sendToolUse(processor, context, "tool-tue-1", "run_shell_command", {
        command: "ls",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-tue-1",
        "tool_use_error: invalid tool call",
      );

      expect(autoRejectionCalled).toBe(false);
    });
  });

  describe("Command result loop detection (non-error tool results)", () => {
    it("should call onCommandResultLoop for non-error tool results", () => {
      const processor = createProcessor();
      const loopCheckCalls: Array<{
        toolName: string;
        input: any;
        result: any;
      }> = [];

      const context = createMockContext({
        onCommandResultLoop: (toolName, input, result) => {
          loopCheckCalls.push({ toolName, input, result });
          return null;
        },
      });

      sendToolUse(processor, context, "tool-cmd-1", "run_shell_command", {
        command: "go build",
      });
      sendToolResult(
        processor,
        context,
        "tool-cmd-1",
        "Exit Code: 1\nError: go.mod not found",
      );

      expect(loopCheckCalls).toHaveLength(1);
      expect(loopCheckCalls[0].toolName).toBe("run_shell_command");
    });

    it("should show loop dialog when command result loop detected", () => {
      const processor = createProcessor();
      let loopRequestShown: CommandLoopRequest | null = null;

      const context = createMockContext({
        onCommandResultLoop: (toolName, input, result) => {
          return {
            isOpen: true,
            toolName,
            command: String(input.command || ""),
            errorOutput: result.output.substring(0, 200),
          };
        },
        onShowCommandLoopRequest: (request) => {
          loopRequestShown = request;
        },
      });

      sendToolUse(processor, context, "tool-cmdloop-1", "run_shell_command", {
        command: "go build",
      });
      sendToolResult(
        processor,
        context,
        "tool-cmdloop-1",
        "Exit Code: 1\nError: go.mod not found",
      );

      expect(loopRequestShown).not.toBeNull();
      expect(loopRequestShown!.toolName).toBe("run_shell_command");
    });

    it("should NOT call onCommandResultLoop for is_error tool results", () => {
      const processor = createProcessor();
      let commandLoopCalled = false;

      const context = createMockContext({
        onCommandResultLoop: () => {
          commandLoopCalled = true;
          return null;
        },
        onAutoRejection: () => null,
        onPermissionError: () => {},
        onAbortRequest: () => {},
      });

      sendToolUse(processor, context, "tool-err-1", "run_shell_command", {
        command: "ssh",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-err-1",
        "[Operation Cancelled] Input closed",
      );

      // is_error tool results should NOT trigger command result loop detection
      expect(commandLoopCalled).toBe(false);
    });
  });

  describe("Three detection mechanisms independence", () => {
    it("should route is_error and non-error results to different detection paths", () => {
      const processor = createProcessor();
      const autoRejectionCalls: string[] = [];
      const commandResultCalls: string[] = [];

      const context = createMockContext({
        onAutoRejection: (toolName) => {
          autoRejectionCalls.push(toolName);
          return null;
        },
        onCommandResultLoop: (toolName) => {
          commandResultCalls.push(toolName);
          return null;
        },
        onPermissionError: () => {},
        onAbortRequest: () => {},
      });

      // 1. is_error → auto-rejection path
      sendToolUse(processor, context, "tool-ind-1", "run_shell_command", {
        command: "ssh",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-ind-1",
        "Input closed",
      );

      // 2. non-error → command result path
      sendToolUse(processor, context, "tool-ind-2", "run_shell_command", {
        command: "go build",
      });
      sendToolResult(
        processor,
        context,
        "tool-ind-2",
        "Exit Code: 1\nError: build failed",
      );

      expect(autoRejectionCalls).toHaveLength(1);
      expect(commandResultCalls).toHaveLength(1);
      expect(autoRejectionCalls[0]).toBe("run_shell_command");
      expect(commandResultCalls[0]).toBe("run_shell_command");
    });
  });

  describe("Deduplication does not affect loop detection", () => {
    it("should handle repeated tool_use/tool_result pairs with different IDs", () => {
      const processor = createProcessor();
      const autoRejectionCalls: string[] = [];

      const context = createMockContext({
        onAutoRejection: (toolName) => {
          autoRejectionCalls.push(toolName);
          return null;
        },
        onPermissionError: () => {},
        onAbortRequest: () => {},
      });

      // Cycle 1
      sendToolUse(processor, context, "tool-dedup-1", "run_shell_command", {
        command: "ssh",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-dedup-1",
        "Input closed",
      );

      // Cycle 2 (different tool_use_id)
      sendToolUse(processor, context, "tool-dedup-2", "run_shell_command", {
        command: "ssh",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-dedup-2",
        "Input closed",
      );

      // Both cycles should trigger auto-rejection check
      expect(autoRejectionCalls).toHaveLength(2);
    });
  });

  describe("onAutoRejection is optional", () => {
    it("should fall back to permission error when onAutoRejection is not provided", () => {
      const processor = createProcessor();
      let permissionErrorCalled = false;

      const context = createMockContext({
        // No onAutoRejection
        onPermissionError: () => {
          permissionErrorCalled = true;
        },
        onAbortRequest: () => {},
      });

      sendToolUse(processor, context, "tool-noar-1", "run_shell_command", {
        command: "ssh",
      });
      sendErrorToolResult(
        processor,
        context,
        "tool-noar-1",
        "Input closed",
      );

      expect(permissionErrorCalled).toBe(true);
    });
  });
});

describe("UnifiedMessageProcessor - Qwen SDK Format", () => {
  function createProcessor() {
    return new UnifiedMessageProcessor();
  }

  function createMockContext(
    overrides: Partial<ProcessingContext> = {},
  ): ProcessingContext {
    return {
      addMessage: () => {},
      updateLastMessage: () => {},
      setCurrentAssistantMessage: () => {},
      setHasReceivedInit: () => {},
      ...overrides,
    };
  }

  /**
   * Helper: send assistant message with functionCall in parts (Qwen format)
   */
  function sendFunctionCall(
    processor: UnifiedMessageProcessor,
    context: ProcessingContext,
    toolUseId: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
  ) {
    processor.processMessage(
      {
        type: "assistant",
        message: {
          role: "model",
          parts: [
            { text: "Let me search for this." },
            {
              functionCall: {
                id: toolUseId,
                name: toolName,
                args: toolArgs,
              },
            },
          ],
        },
      } as any,
      context,
      { isStreaming: true },
    );
  }

  /**
   * Helper: send top-level tool_result with functionResponse in parts (Qwen format)
   */
  function sendQwenToolResult(
    processor: UnifiedMessageProcessor,
    context: ProcessingContext,
    toolUseId: string,
    toolName: string,
    output: string,
    isError = false,
  ) {
    processor.processMessage(
      {
        type: "tool_result",
        message: {
          role: "user",
          parts: [
            {
              functionResponse: {
                id: toolUseId,
                name: toolName,
                response: { output },
              },
            },
          ],
        },
        toolCallResult: {
          callId: toolUseId,
          status: isError ? "error" : "success",
          resultDisplay: output.substring(0, 100),
        },
      } as any,
      context,
      { isStreaming: true },
    );
  }

  describe("functionCall in assistant parts", () => {
    it("should cache tool_use info from functionCall in parts", () => {
      const processor = createProcessor();
      const autoRejectionCalls: Array<{ toolName: string; content: string }> = [];

      const context = createMockContext({
        onAutoRejection: (toolName, content) => {
          autoRejectionCalls.push({ toolName, content });
          return null;
        },
        onPermissionError: () => {},
        onAbortRequest: () => {},
      });

      // Send tool call via functionCall (Qwen format)
      sendFunctionCall(processor, context, "fc-1", "grep_search", {
        pattern: "TODO",
      });

      // Send error result via Qwen tool_result format
      sendQwenToolResult(
        processor,
        context,
        "fc-1",
        "grep_search",
        "[Operation Cancelled] Reason: Error: Input closed",
        true,
      );

      // The auto-rejection callback should be called with correct tool name
      expect(autoRejectionCalls).toHaveLength(1);
      expect(autoRejectionCalls[0].toolName).toBe("grep_search");
    });

    it("should create tool message for functionCall", () => {
      const processor = createProcessor();
      const messages: any[] = [];

      const context = createMockContext({
        addMessage: (msg) => messages.push(msg),
      });

      sendFunctionCall(processor, context, "fc-msg-1", "read_file", {
        file_path: "/tmp/test.txt",
      });

      const toolMsg = messages.find((m) => m.type === "tool");
      expect(toolMsg).toBeDefined();
      expect(toolMsg.content).toContain("read_file");
    });

    it("should handle multiple functionCalls in one assistant message", () => {
      const processor = createProcessor();
      const messages: any[] = [];

      const context = createMockContext({
        addMessage: (msg) => messages.push(msg),
      });

      processor.processMessage(
        {
          type: "assistant",
          message: {
            role: "model",
            parts: [
              { text: "Let me search." },
              {
                functionCall: {
                  id: "fc-multi-1",
                  name: "grep_search",
                  args: { pattern: "TODO" },
                },
              },
              {
                functionCall: {
                  id: "fc-multi-2",
                  name: "glob",
                  args: { pattern: "**/*.ts" },
                },
              },
            ],
          },
        } as any,
        context,
        { isStreaming: true },
      );

      const toolMsgs = messages.filter((m) => m.type === "tool");
      expect(toolMsgs).toHaveLength(2);
      expect(toolMsgs[0].content).toContain("grep_search");
      expect(toolMsgs[1].content).toContain("glob");
    });
  });

  describe("functionResponse in user parts", () => {
    it("should process functionResponse as tool result", () => {
      const processor = createProcessor();
      const messages: any[] = [];

      const context = createMockContext({
        addMessage: (msg) => messages.push(msg),
      });

      // First send the functionCall to cache it
      sendFunctionCall(processor, context, "fr-1", "read_file", {
        file_path: "/tmp/test.txt",
      });
      messages.length = 0; // Clear tool messages

      // Send via user message with functionResponse in parts
      processor.processMessage(
        {
          type: "user",
          message: {
            role: "user",
            parts: [
              {
                functionResponse: {
                  id: "fr-1",
                  name: "read_file",
                  response: { output: "File contents here" },
                },
              },
            ],
          },
        } as any,
        context,
        { isStreaming: true },
      );

      const resultMsg = messages.find((m) => m.type === "tool_result");
      expect(resultMsg).toBeDefined();
      expect(resultMsg.content).toContain("File contents here");
      expect(resultMsg.toolName).toBe("read_file");
    });
  });

  describe("top-level tool_result messages (Qwen SDK format)", () => {
    it("should process top-level tool_result with functionResponse", () => {
      const processor = createProcessor();
      const messages: any[] = [];

      const context = createMockContext({
        addMessage: (msg) => messages.push(msg),
      });

      // First send the functionCall to cache it
      sendFunctionCall(processor, context, "tr-1", "grep_search", {
        pattern: "test",
      });
      messages.length = 0;

      // Send as top-level tool_result message
      sendQwenToolResult(processor, context, "tr-1", "grep_search", "Found 5 matches");

      const resultMsg = messages.find((m) => m.type === "tool_result");
      expect(resultMsg).toBeDefined();
      expect(resultMsg.toolName).toBe("grep_search");
      expect(resultMsg.content).toContain("Found 5 matches");
    });

    it("should trigger auto-rejection for error tool_result from Qwen SDK", () => {
      const processor = createProcessor();
      const autoRejectionCalls: Array<{ toolName: string; content: string }> = [];

      const context = createMockContext({
        onAutoRejection: (toolName, content) => {
          autoRejectionCalls.push({ toolName, content });
          return null;
        },
        onPermissionError: () => {},
        onAbortRequest: () => {},
      });

      // Send tool call
      sendFunctionCall(processor, context, "tr-err-1", "run_shell_command", {
        command: "npm test",
      });

      // Send error result via top-level tool_result
      sendQwenToolResult(
        processor,
        context,
        "tr-err-1",
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed",
        true,
      );

      expect(autoRejectionCalls).toHaveLength(1);
      expect(autoRejectionCalls[0].toolName).toBe("run_shell_command");
      expect(autoRejectionCalls[0].content).toContain("Input closed");
    });

    it("should trigger auto-abort when loop detected via Qwen tool_result", () => {
      const processor = createProcessor();
      let abortCalled = false;
      let loopRequestShown: CommandLoopRequest | null = null;

      const context = createMockContext({
        onAutoRejection: (toolName, content) => {
          return {
            isOpen: true,
            toolName,
            command: toolName,
            errorOutput: content.substring(0, 200),
          };
        },
        onShowCommandLoopRequest: (request) => {
          loopRequestShown = request;
        },
        onAbortRequest: () => {
          abortCalled = true;
        },
      });

      sendFunctionCall(processor, context, "tr-loop-1", "run_shell_command", {
        command: "ssh test",
      });

      sendQwenToolResult(
        processor,
        context,
        "tr-loop-1",
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed",
        true,
      );

      expect(abortCalled).toBe(true);
      expect(loopRequestShown).not.toBeNull();
      expect(loopRequestShown!.toolName).toBe("run_shell_command");
    });

    it("should trigger command result loop detection via Qwen tool_result", () => {
      const processor = createProcessor();
      const loopCheckCalls: Array<{ toolName: string; result: any }> = [];

      const context = createMockContext({
        onCommandResultLoop: (toolName, _input, result) => {
          loopCheckCalls.push({ toolName, result });
          return null;
        },
      });

      sendFunctionCall(processor, context, "tr-cmdloop-1", "run_shell_command", {
        command: "go build",
      });

      sendQwenToolResult(
        processor,
        context,
        "tr-cmdloop-1",
        "run_shell_command",
        "Exit Code: 1\nError: go.mod not found",
      );

      expect(loopCheckCalls).toHaveLength(1);
      expect(loopCheckCalls[0].toolName).toBe("run_shell_command");
    });

    it("should handle streaming of Qwen format messages", () => {
      const processor = createProcessor();
      const messages: any[] = [];

      const context = createMockContext({
        addMessage: (msg) => messages.push(msg),
      });

      // Streaming: assistant with functionCall
      processor.processMessage(
        {
          type: "assistant",
          message: {
            role: "model",
            parts: [
              { text: "Thinking...", thought: true },
              { text: "Let me search." },
              {
                functionCall: {
                  id: "batch-fc-1",
                  name: "grep_search",
                  args: { pattern: "TODO" },
                },
              },
            ],
          },
        } as any,
        context,
        { isStreaming: true },
      );

      // Streaming: tool_result
      processor.processMessage(
        {
          type: "tool_result",
          message: {
            role: "user",
            parts: [
              {
                functionResponse: {
                  id: "batch-fc-1",
                  name: "grep_search",
                  response: { output: "Found 3 matches" },
                },
              },
            ],
          },
          toolCallResult: {
            callId: "batch-fc-1",
            status: "success",
            resultDisplay: "Found 3 matches",
          },
        } as any,
        context,
        { isStreaming: true },
      );

      // Should have: thinking, tool (grep_search), tool_result, assistant text
      const thinkingMsg = messages.find((m) => m.type === "thinking");
      const toolMsg = messages.find((m) => m.type === "tool");
      const resultMsg = messages.find((m) => m.type === "tool_result");

      expect(thinkingMsg).toBeDefined();
      expect(toolMsg).toBeDefined();
      expect(toolMsg.content).toContain("grep_search");
      expect(resultMsg).toBeDefined();
      expect(resultMsg.content).toContain("Found 3 matches");
    });
  });

  describe("Mixed Claude and Qwen formats", () => {
    it("should handle both Claude content and Qwen parts formats", () => {
      const processor = createProcessor();
      const autoRejectionCalls: Array<string> = [];

      const context = createMockContext({
        onAutoRejection: (toolName) => {
          autoRejectionCalls.push(toolName);
          return null;
        },
        onPermissionError: () => {},
        onAbortRequest: () => {},
      });

      // Claude format tool_use
      processor.processMessage(
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "mix-1",
                name: "read_file",
                input: { file_path: "/tmp/a.txt" },
              },
            ],
          },
        } as any,
        context,
        { isStreaming: true },
      );
      // Claude format error result
      processor.processMessage(
        {
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "mix-1",
                content: "Input closed",
                is_error: true,
              },
            ],
          },
        } as any,
        context,
        { isStreaming: true },
      );

      // Qwen format tool_use
      sendFunctionCall(processor, context, "mix-2", "grep_search", {
        pattern: "test",
      });
      // Qwen format error result (top-level tool_result)
      sendQwenToolResult(
        processor,
        context,
        "mix-2",
        "grep_search",
        "Input closed",
        true,
      );

      expect(autoRejectionCalls).toHaveLength(2);
      expect(autoRejectionCalls[0]).toBe("read_file");
      expect(autoRejectionCalls[1]).toBe("grep_search");
    });
  });
});
