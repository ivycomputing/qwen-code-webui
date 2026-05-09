import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePermissions, type CommandLoopRequest } from "./usePermissions";
import { TOOL_NAMES } from "../../utils/toolNames";

describe("usePermissions", () => {
  it("should initialize with empty allowed tools", () => {
    const { result } = renderHook(() => usePermissions());
    expect(result.current.allowedTools).toEqual([]);
    expect(result.current.permissionRequest).toBeNull();
  });

  it("should show permission request", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.showPermissionRequest(TOOL_NAMES.BASH, [`${TOOL_NAMES.BASH}(ls:*)`], "tool-123");
    });

    expect(result.current.permissionRequest).toEqual({
      isOpen: true,
      toolName: TOOL_NAMES.BASH,
      patterns: [`${TOOL_NAMES.BASH}(ls:*)`],
      toolUseId: "tool-123",
    });
  });

  it("should close permission request", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.showPermissionRequest(TOOL_NAMES.BASH, [`${TOOL_NAMES.BASH}(ls:*)`], "tool-123");
    });

    act(() => {
      result.current.closePermissionRequest();
    });

    expect(result.current.permissionRequest).toBeNull();
  });

  it("should allow tool temporarily", () => {
    const { result } = renderHook(() => usePermissions());

    let tempAllowedTools: string[] = [];

    act(() => {
      tempAllowedTools = result.current.allowToolTemporary(`${TOOL_NAMES.BASH}(ls:*)`);
    });

    expect(tempAllowedTools).toEqual([`${TOOL_NAMES.BASH}(ls:*)`]);
    // Should not update permanent allowed tools
    expect(result.current.allowedTools).toEqual([]);
  });

  it("should allow tool permanently", () => {
    const { result } = renderHook(() => usePermissions());

    let updatedAllowedTools: string[] = [];

    act(() => {
      updatedAllowedTools = result.current.allowToolPermanent(`${TOOL_NAMES.BASH}(ls:*)`);
    });

    expect(updatedAllowedTools).toEqual([`${TOOL_NAMES.BASH}(ls:*)`]);
    expect(result.current.allowedTools).toEqual([`${TOOL_NAMES.BASH}(ls:*)`]);
  });

  it("should allow multiple tools with base tools parameter", () => {
    const { result } = renderHook(() => usePermissions());

    let updatedAllowedTools: string[] = [];

    // First add one tool permanently
    act(() => {
      updatedAllowedTools = result.current.allowToolPermanent(`${TOOL_NAMES.BASH}(ls:*)`);
    });

    // Then add another with base tools
    act(() => {
      updatedAllowedTools = result.current.allowToolPermanent(
        `${TOOL_NAMES.BASH}(grep:*)`,
        updatedAllowedTools,
      );
    });

    expect(updatedAllowedTools).toEqual([`${TOOL_NAMES.BASH}(ls:*)`, `${TOOL_NAMES.BASH}(grep:*)`]);
    expect(result.current.allowedTools).toEqual([`${TOOL_NAMES.BASH}(ls:*)`, `${TOOL_NAMES.BASH}(grep:*)`]);
  });

  it("should reset permissions", () => {
    const { result } = renderHook(() => usePermissions());

    // Add some tools first
    act(() => {
      result.current.allowToolPermanent(`${TOOL_NAMES.BASH}(ls:*)`);
    });

    act(() => {
      result.current.allowToolPermanent(`${TOOL_NAMES.BASH}(grep:*)`);
    });

    expect(result.current.allowedTools).toEqual([`${TOOL_NAMES.BASH}(ls:*)`, `${TOOL_NAMES.BASH}(grep:*)`]);

    // Reset permissions
    act(() => {
      result.current.resetPermissions();
    });

    expect(result.current.allowedTools).toEqual([]);
  });

  it("should handle compound permission scenario", () => {
    const { result } = renderHook(() => usePermissions());

    // Simulate compound command permission handling
    const patterns = [`${TOOL_NAMES.BASH}(ls:*)`, `${TOOL_NAMES.BASH}(grep:*)`];
    let finalAllowedTools: string[] = [];

    act(() => {
      // Add all patterns like in the real permission handler
      let currentTools = result.current.allowedTools;
      patterns.forEach((pattern) => {
        currentTools = result.current.allowToolPermanent(pattern, currentTools);
      });
      finalAllowedTools = currentTools;
    });

    expect(finalAllowedTools).toEqual([`${TOOL_NAMES.BASH}(ls:*)`, `${TOOL_NAMES.BASH}(grep:*)`]);
    expect(result.current.allowedTools).toEqual([`${TOOL_NAMES.BASH}(ls:*)`, `${TOOL_NAMES.BASH}(grep:*)`]);
  });

  it("should handle empty patterns array gracefully", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.showPermissionRequest(TOOL_NAMES.BASH, [], "tool-123");
    });

    expect(result.current.permissionRequest).toEqual({
      isOpen: true,
      toolName: TOOL_NAMES.BASH,
      patterns: [],
      toolUseId: "tool-123",
    });
  });

  it("should handle fallback patterns for command -v scenario", () => {
    const { result } = renderHook(() => usePermissions());

    // Simulate command -v case where fallback should provide command pattern
    const patterns = [`${TOOL_NAMES.BASH}(command:*)`];

    act(() => {
      result.current.showPermissionRequest(TOOL_NAMES.BASH, patterns, "tool-123");
    });

    expect(result.current.permissionRequest).toEqual({
      isOpen: true,
      toolName: TOOL_NAMES.BASH,
      patterns: [`${TOOL_NAMES.BASH}(command:*)`],
      toolUseId: "tool-123",
    });
  });
});

describe("usePermissions - Permission Denial Loop Detection", () => {
  it("should not detect loop on first denial", () => {
    const { result } = renderHook(() => usePermissions());

    let loopMessage: string | null = null;

    act(() => {
      loopMessage = result.current.recordDenial(TOOL_NAMES.BASH);
    });

    expect(loopMessage).toBeNull();
  });

  it("should not detect loop on second denial", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.recordDenial(TOOL_NAMES.BASH);
    });

    let loopMessage: string | null = null;
    act(() => {
      loopMessage = result.current.recordDenial(TOOL_NAMES.BASH);
    });

    expect(loopMessage).toBeNull();
  });

  it("should detect loop on third consecutive denial of same tool", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });
    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });

    let loopMessage: string | null = null;
    act(() => {
      loopMessage = result.current.recordDenial(TOOL_NAMES.BASH);
    });

    expect(loopMessage).not.toBeNull();
    expect(loopMessage).toContain("Loop Detection Triggered");
  });

  it("should reset counter for different tool denial", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });
    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });

    // Different tool resets counter
    act(() => { result.current.recordDenial(TOOL_NAMES.WRITE); });

    // Back to Bash - counter should be 1
    let loopMessage: string | null = null;
    act(() => {
      loopMessage = result.current.recordDenial(TOOL_NAMES.BASH);
    });

    expect(loopMessage).toBeNull();
  });

  it("should reset counter when resetDenialCounter is called", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });
    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });

    act(() => { result.current.resetDenialCounter(); });

    let loopMessage: string | null = null;
    act(() => {
      loopMessage = result.current.recordDenial(TOOL_NAMES.BASH);
    });

    expect(loopMessage).toBeNull();
  });

  it("should not detect loop for excluded tools (exit_plan_mode)", () => {
    const { result } = renderHook(() => usePermissions());

    let loopMessage: string | null = null;
    for (let i = 0; i < 5; i++) {
      act(() => {
        loopMessage = result.current.recordDenial("exit_plan_mode");
      });
    }

    expect(loopMessage).toBeNull();
  });

  it("should reset counter after triggering", () => {
    const { result } = renderHook(() => usePermissions());

    // Trigger once
    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });
    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });
    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });

    // Should be reset now, so 2 more denials should not trigger
    let loopMessage: string | null = null;
    act(() => { result.current.recordDenial(TOOL_NAMES.BASH); });
    act(() => {
      loopMessage = result.current.recordDenial(TOOL_NAMES.BASH);
    });

    expect(loopMessage).toBeNull();
  });
});

describe("usePermissions - Command Result Loop Detection", () => {
  it("should not detect loop on first error result", () => {
    const { result } = renderHook(() => usePermissions());

    let loopRequest: CommandLoopRequest | null = null;

    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    expect(loopRequest).toBeNull();
    expect(result.current.commandLoopRequest).toBeNull();
  });

  it("should not detect loop on second error result", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should detect loop on third same error result", () => {
    const { result } = renderHook(() => usePermissions());

    // First call
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    // Second call
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    // Third call - should trigger loop detection
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    expect(loopRequest).not.toBeNull();
    expect(loopRequest!.toolName).toBe("run_shell_command");
    expect(loopRequest!.command).toBe("go build");
    expect(loopRequest!.errorOutput).toBe("go: go.mod file not found");
  });

  it("should not detect loop for different errors", () => {
    const { result } = renderHook(() => usePermissions());

    // First call - error 1
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    // Second call - different error
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "cannot find package" }
      );
    });

    // Third call - another different error
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "undefined variable" }
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should not detect loop for successful results", () => {
    const { result } = renderHook(() => usePermissions());

    // First call - error
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    // Second call - success (should reset tracking)
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 0, output: "Build successful" }
      );
    });

    // Third call - error again (count should be 1)
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    // Fourth call - error (count should be 2)
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should not detect loop for excluded tools", () => {
    const { result } = renderHook(() => usePermissions());

    // read_file is in excluded tools
    let loopRequest: CommandLoopRequest | null = null;

    // Call 3 times with same error
    for (let i = 0; i < 3; i++) {
      act(() => {
        loopRequest = result.current.checkCommandResultLoop(
          "read_file",
          { file_path: "/test/file.txt" },
          { exitCode: 1, output: "file not found" }
        );
      });
    }

    expect(loopRequest).toBeNull();
  });

  it("should show and close command loop request dialog", () => {
    const { result } = renderHook(() => usePermissions());

    const testRequest = {
      isOpen: true,
      toolName: "run_shell_command",
      command: "go build",
      errorOutput: "go: go.mod file not found",
    };

    act(() => {
      result.current.showCommandLoopRequest(testRequest);
    });

    expect(result.current.commandLoopRequest).toEqual(testRequest);

    act(() => {
      result.current.closeCommandLoopRequest();
    });

    expect(result.current.commandLoopRequest).toBeNull();
  });

  it("should disable loop detection for session", () => {
    const { result } = renderHook(() => usePermissions());

    // Trigger loop detection
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.checkCommandResultLoop(
          "run_shell_command",
          { command: "go build" },
          { exitCode: 1, output: "go: go.mod file not found" }
        );
      });
    }

    // Show dialog
    act(() => {
      result.current.showCommandLoopRequest({
        isOpen: true,
        toolName: "run_shell_command",
        command: "go build",
        errorOutput: "go: go.mod file not found",
      });
    });

    expect(result.current.commandLoopRequest).not.toBeNull();

    // Reset loop detection counters (simulating auto-abort notification dismiss)
    act(() => {
      result.current.disableCommandResultLoopDetection();
    });

    expect(result.current.commandLoopRequest).toBeNull();

    // After resetting, loop detection remains active
    // First 2 calls build up tracking again
    for (let i = 0; i < 2; i++) {
      let loopRequest: CommandLoopRequest | null = null;
      act(() => {
        loopRequest = result.current.checkCommandResultLoop(
          "run_shell_command",
          { command: "go build" },
          { exitCode: 1, output: "go: go.mod file not found" }
        );
      });
      expect(loopRequest).toBeNull();
    }

    // Third call should trigger loop detection again (counter reset allows re-detection)
    let thirdLoopRequest: CommandLoopRequest | null = null;
    act(() => {
      thirdLoopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "go build" },
        { exitCode: 1, output: "go: go.mod file not found" }
      );
    });
    expect(thirdLoopRequest).not.toBeNull();
    expect(thirdLoopRequest!.toolName).toBe("run_shell_command");
  });

  it("should detect loop with error keywords even without exit code", () => {
    const { result } = renderHook(() => usePermissions());

    // Call 3 times with error keyword in output
    for (let i = 0; i < 2; i++) {
      act(() => {
        result.current.checkCommandResultLoop(
          "run_shell_command",
          { command: "npm install" },
          { output: "Error: package not found" }
        );
      });
    }

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "npm install" },
        { output: "Error: package not found" }
      );
    });

    expect(loopRequest).not.toBeNull();
  });
});

describe("usePermissions - Auto-Rejection Loop Detection", () => {
  it("should detect Input closed on first auto-rejection (fatal)", () => {
    const { result } = renderHook(() => usePermissions());

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    expect(loopRequest).not.toBeNull();
    expect(loopRequest!.toolName).toBe("run_shell_command");
    expect(loopRequest!.errorOutput).toContain("Input closed");
  });

  it("should detect full SDK error format on first auto-rejection (fatal)", () => {
    const { result } = renderHook(() => usePermissions());

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "edit",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    expect(loopRequest).not.toBeNull();
  });

  it("should NOT treat standalone Operation Cancelled as fatal", () => {
    const { result } = renderHook(() => usePermissions());

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "Operation Cancelled"
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should not detect loop on first non-fatal auto-rejection", () => {
    const { result } = renderHook(() => usePermissions());

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should not detect loop on second non-fatal auto-rejection", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should detect loop on third same-tool non-fatal auto-rejection", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    expect(loopRequest).not.toBeNull();
    expect(loopRequest!.toolName).toBe("run_shell_command");
  });

  it("should reset counter for different tool auto-rejection", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    // Different tool - should reset counter
    act(() => {
      result.current.recordAutoRejection(
        "write_file",
        "Permission denied"
      );
    });

    // Back to original tool - should be count 1 again
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should respect disabled loop detection flag for non-fatal errors", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.disableCommandResultLoopDetection();
    });

    // Non-fatal auto-rejections should not trigger
    let loopRequest: CommandLoopRequest | null = null;
    for (let i = 0; i < 5; i++) {
      act(() => {
        loopRequest = result.current.recordAutoRejection(
          "run_shell_command",
          "Permission denied"
        );
      });
    }

    expect(loopRequest).toBeNull();

    // Input closed should still trigger even when disabled
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    expect(loopRequest).not.toBeNull();
  });

  it("should reset non-fatal auto-rejection counter", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    // Reset counter
    act(() => {
      result.current.resetAutoRejectionCounter();
    });

    // Should be back to count 1
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "Permission denied"
      );
    });

    expect(loopRequest).toBeNull();
  });
});
