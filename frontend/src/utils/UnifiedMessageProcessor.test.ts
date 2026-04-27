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
