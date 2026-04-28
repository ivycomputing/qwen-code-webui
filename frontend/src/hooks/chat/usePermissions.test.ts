import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePermissions, type CommandLoopRequest } from "./usePermissions";

describe("usePermissions", () => {
  it("should initialize with empty allowed tools", () => {
    const { result } = renderHook(() => usePermissions());
    expect(result.current.allowedTools).toEqual([]);
    expect(result.current.permissionRequest).toBeNull();
  });

  it("should show permission request", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.showPermissionRequest("Bash", ["Bash(ls:*)"], "tool-123");
    });

    expect(result.current.permissionRequest).toEqual({
      isOpen: true,
      toolName: "Bash",
      patterns: ["Bash(ls:*)"],
      toolUseId: "tool-123",
    });
  });

  it("should close permission request", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.showPermissionRequest("Bash", ["Bash(ls:*)"], "tool-123");
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
      tempAllowedTools = result.current.allowToolTemporary("Bash(ls:*)");
    });

    expect(tempAllowedTools).toEqual(["Bash(ls:*)"]);
    // Should not update permanent allowed tools
    expect(result.current.allowedTools).toEqual([]);
  });

  it("should allow tool permanently", () => {
    const { result } = renderHook(() => usePermissions());

    let updatedAllowedTools: string[] = [];

    act(() => {
      updatedAllowedTools = result.current.allowToolPermanent("Bash(ls:*)");
    });

    expect(updatedAllowedTools).toEqual(["Bash(ls:*)"]);
    expect(result.current.allowedTools).toEqual(["Bash(ls:*)"]);
  });

  it("should allow multiple tools with base tools parameter", () => {
    const { result } = renderHook(() => usePermissions());

    let updatedAllowedTools: string[] = [];

    // First add one tool permanently
    act(() => {
      updatedAllowedTools = result.current.allowToolPermanent("Bash(ls:*)");
    });

    // Then add another with base tools
    act(() => {
      updatedAllowedTools = result.current.allowToolPermanent(
        "Bash(grep:*)",
        updatedAllowedTools,
      );
    });

    expect(updatedAllowedTools).toEqual(["Bash(ls:*)", "Bash(grep:*)"]);
    expect(result.current.allowedTools).toEqual(["Bash(ls:*)", "Bash(grep:*)"]);
  });

  it("should reset permissions", () => {
    const { result } = renderHook(() => usePermissions());

    // Add some tools first
    act(() => {
      result.current.allowToolPermanent("Bash(ls:*)");
    });

    act(() => {
      result.current.allowToolPermanent("Bash(grep:*)");
    });

    expect(result.current.allowedTools).toEqual(["Bash(ls:*)", "Bash(grep:*)"]);

    // Reset permissions
    act(() => {
      result.current.resetPermissions();
    });

    expect(result.current.allowedTools).toEqual([]);
  });

  it("should handle compound permission scenario", () => {
    const { result } = renderHook(() => usePermissions());

    // Simulate compound command permission handling
    const patterns = ["Bash(ls:*)", "Bash(grep:*)"];
    let finalAllowedTools: string[] = [];

    act(() => {
      // Add all patterns like in the real permission handler
      let currentTools = result.current.allowedTools;
      patterns.forEach((pattern) => {
        currentTools = result.current.allowToolPermanent(pattern, currentTools);
      });
      finalAllowedTools = currentTools;
    });

    expect(finalAllowedTools).toEqual(["Bash(ls:*)", "Bash(grep:*)"]);
    expect(result.current.allowedTools).toEqual(["Bash(ls:*)", "Bash(grep:*)"]);
  });

  it("should handle empty patterns array gracefully", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.showPermissionRequest("Bash", [], "tool-123");
    });

    expect(result.current.permissionRequest).toEqual({
      isOpen: true,
      toolName: "Bash",
      patterns: [],
      toolUseId: "tool-123",
    });
  });

  it("should handle fallback patterns for command -v scenario", () => {
    const { result } = renderHook(() => usePermissions());

    // Simulate command -v case where fallback should provide command pattern
    const patterns = ["Bash(command:*)"];

    act(() => {
      result.current.showPermissionRequest("Bash", patterns, "tool-123");
    });

    expect(result.current.permissionRequest).toEqual({
      isOpen: true,
      toolName: "Bash",
      patterns: ["Bash(command:*)"],
      toolUseId: "tool-123",
    });
  });
});

describe("usePermissions - Permission Denial Loop Detection", () => {
  it("should not detect loop on first denial", () => {
    const { result } = renderHook(() => usePermissions());

    let loopMessage: string | null = null;

    act(() => {
      loopMessage = result.current.recordDenial("Bash");
    });

    expect(loopMessage).toBeNull();
  });

  it("should not detect loop on second denial", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.recordDenial("Bash");
    });

    let loopMessage: string | null = null;
    act(() => {
      loopMessage = result.current.recordDenial("Bash");
    });

    expect(loopMessage).toBeNull();
  });

  it("should detect loop on third consecutive denial of same tool", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => { result.current.recordDenial("Bash"); });
    act(() => { result.current.recordDenial("Bash"); });

    let loopMessage: string | null = null;
    act(() => {
      loopMessage = result.current.recordDenial("Bash");
    });

    expect(loopMessage).not.toBeNull();
    expect(loopMessage).toContain("Loop Detection Triggered");
  });

  it("should reset counter for different tool denial", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => { result.current.recordDenial("Bash"); });
    act(() => { result.current.recordDenial("Bash"); });

    // Different tool resets counter
    act(() => { result.current.recordDenial("Write"); });

    // Back to Bash - counter should be 1
    let loopMessage: string | null = null;
    act(() => {
      loopMessage = result.current.recordDenial("Bash");
    });

    expect(loopMessage).toBeNull();
  });

  it("should reset counter when resetDenialCounter is called", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => { result.current.recordDenial("Bash"); });
    act(() => { result.current.recordDenial("Bash"); });

    act(() => { result.current.resetDenialCounter(); });

    let loopMessage: string | null = null;
    act(() => {
      loopMessage = result.current.recordDenial("Bash");
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
    act(() => { result.current.recordDenial("Bash"); });
    act(() => { result.current.recordDenial("Bash"); });
    act(() => { result.current.recordDenial("Bash"); });

    // Should be reset now, so 2 more denials should not trigger
    let loopMessage: string | null = null;
    act(() => { result.current.recordDenial("Bash"); });
    act(() => {
      loopMessage = result.current.recordDenial("Bash");
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
  it("should not detect loop on first auto-rejection", () => {
    const { result } = renderHook(() => usePermissions());

    let loopRequest: CommandLoopRequest | null = null;

    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should not detect loop on second auto-rejection", () => {
    const { result } = renderHook(() => usePermissions());

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should detect loop on third same-tool auto-rejection", () => {
    const { result } = renderHook(() => usePermissions());

    // First two auto-rejections
    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    // Third - should trigger
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

  it("should reset counter for different tool auto-rejection", () => {
    const { result } = renderHook(() => usePermissions());

    // Two auto-rejections for run_shell_command
    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    // Different tool - should reset counter
    act(() => {
      result.current.recordAutoRejection(
        "write_file",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    // Back to original tool - should be count 1 again
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    expect(loopRequest).toBeNull();
  });

  it("should respect disabled loop detection flag", () => {
    const { result } = renderHook(() => usePermissions());

    // Disable loop detection
    act(() => {
      result.current.disableCommandResultLoopDetection();
    });

    // Try 5 auto-rejections - should never trigger
    let loopRequest: CommandLoopRequest | null = null;
    for (let i = 0; i < 5; i++) {
      act(() => {
        loopRequest = result.current.recordAutoRejection(
          "run_shell_command",
          "[Operation Cancelled] Reason: Error: Input closed"
        );
      });
    }

    expect(loopRequest).toBeNull();
  });

  it("should reset auto-rejection counter", () => {
    const { result } = renderHook(() => usePermissions());

    // Two auto-rejections
    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    act(() => {
      result.current.recordAutoRejection(
        "run_shell_command",
        "[Operation Cancelled] Reason: Error: Input closed"
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
        "[Operation Cancelled] Reason: Error: Input closed"
      );
    });

    expect(loopRequest).toBeNull();
  });
});
