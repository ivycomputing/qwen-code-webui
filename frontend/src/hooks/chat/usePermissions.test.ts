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

  it("should not detect loop for different errors with same first 200 chars (#224)", () => {
    const { result } = renderHook(() => usePermissions());

    // Simulate pytest output scenarios from Issue #224
    // Long header with error at the end - differences appear after 200 chars
    const header = `============================= test session starts ==============================
platform linux -- Python 3.11.4, pytest-7.4.0, pluggy-1.0.0
rootdir: /project
plugins: cov-4.1.0, xdist-3.3.1, timeout-2.2.0
collected 150 items

================================= test session =================================
Running test suite for module auth
Test environment: staging
Database: postgresql://localhost:5432/test_db
Cache: redis://localhost:6379/0

`;

    const error1 = header + "FAILED test_auth.py::test_login - AssertionError: expected 200, got 401";
    const error2 = header + "FAILED test_auth.py::test_logout - TypeError: session is None";
    const error3 = header + "FAILED test_auth.py::test_refresh - KeyError: token not found";

    // First call - error 1
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest" },
        { exitCode: 1, output: error1 }
      );
    });

    // Second call - different error (but same first 200 chars before fix)
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest" },
        { exitCode: 1, output: error2 }
      );
    });

    // Third call - another different error (but same first 200 chars before fix)
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest" },
        { exitCode: 1, output: error3 }
      );
    });

    // Should NOT detect loop because errors are actually different
    expect(loopRequest).toBeNull();
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

  it("should not detect loop when first 200 chars are identical but errors differ (#224)", () => {
    const { result } = renderHook(() => usePermissions());

    // Simulate pytest output where first 200 chars are identical (test framework banner)
    // but the actual error is different each time
    const pytestBanner = `============================= test session starts ==============================
platform linux -- Python 3.11.4
collected 10 items
test_foo.py`;

    // First call - test_bar fails
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest test_foo.py" },
        { exitCode: 1, output: `${pytestBanner} FFE [100%]
FAILED test_foo.py::test_bar - AssertionError: expected 1, got 0` }
      );
    });

    // Second call - test_baz fails (different error, same first 200 chars)
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest test_foo.py" },
        { exitCode: 1, output: `${pytestBanner} ..F [100%]
FAILED test_foo.py::test_baz - TypeError: unsupported operand type` }
      );
    });

    // Third call - test_qux fails (different error, same first 200 chars)
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest test_foo.py" },
        { exitCode: 1, output: `${pytestBanner} .F. [100%]
FAILED test_foo.py::test_qux - KeyError: 'missing'` }
      );
    });

    // Should NOT detect loop because errors are actually different
    expect(loopRequest).toBeNull();
  });

  it("should detect loop when full error output is identical (#224)", () => {
    const { result } = renderHook(() => usePermissions());

    // Same error repeated 3 times
    const pytestOutput = `============================= test session starts ==============================
platform linux -- Python 3.11.4
collected 10 items
test_foo.py F [100%]
FAILED test_foo.py::test_bar - AssertionError: expected 1, got 0`;

    // First call
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest test_foo.py" },
        { exitCode: 1, output: pytestOutput }
      );
    });

    // Second call - same error
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest test_foo.py" },
        { exitCode: 1, output: pytestOutput }
      );
    });

    // Third call - same error, should trigger loop detection
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "pytest test_foo.py" },
        { exitCode: 1, output: pytestOutput }
      );
    });

    // Should detect loop because full error output is identical
    expect(loopRequest).not.toBeNull();
    expect(loopRequest!.toolName).toBe("run_shell_command");
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

  it("should clear the agent's tracking on any successful tool call (cross-tool progress)", () => {
    const { result } = renderHook(() => usePermissions());

    // First: run_shell_command error
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "npm test" },
        { exitCode: 1, output: "Error: test failed" }
      );
    });

    // Second: run_shell_command error again
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "npm test" },
        { exitCode: 1, output: "Error: test failed" }
      );
    });

    // Third: different tool (edit) succeeds - should clear this agent's tracking
    act(() => {
      result.current.checkCommandResultLoop(
        "edit",
        { file_path: "/src/file.ts" },
        { exitCode: 0, output: "File edited successfully" }
      );
    });

    // Fourth: run_shell_command error again - count should be 1 (reset by edit success)
    act(() => {
      result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "npm test" },
        { exitCode: 1, output: "Error: test failed" }
      );
    });

    // Fifth: run_shell_command error again - count should be 2
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "npm test" },
        { exitCode: 1, output: "Error: test failed" }
      );
    });

    // Should NOT trigger loop because counter was reset by edit success
    expect(loopRequest).toBeNull();
  });

  it("should not reset another agent's loop counters on success (per-agent isolation, #140)", () => {
    const { result } = renderHook(() => usePermissions());

    // Agent A errors twice on the same command
    for (let i = 0; i < 2; i++) {
      act(() => {
        result.current.checkCommandResultLoop(
          "run_shell_command",
          { command: "npm test" },
          { exitCode: 1, output: "Error: test failed" },
          "agent-a"
        );
      });
    }

    // Agent B (a different fork) makes progress with a successful edit
    act(() => {
      result.current.checkCommandResultLoop(
        "edit",
        { file_path: "/src/other.ts" },
        { exitCode: 0, output: "File edited successfully" },
        "agent-b"
      );
    });

    // Agent A errors a third time — its counter must have survived agent B's
    // success, so the loop IS detected
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "npm test" },
        { exitCode: 1, output: "Error: test failed" },
        "agent-a"
      );
    });

    expect(loopRequest).not.toBeNull();
    expect(loopRequest!.command).toContain("npm test");
  });

  it("should not reset a fork agent's counters on a main-session success (per-agent isolation, #140)", () => {
    const { result } = renderHook(() => usePermissions());

    // Fork agent errors twice
    for (let i = 0; i < 2; i++) {
      act(() => {
        result.current.checkCommandResultLoop(
          "run_shell_command",
          { command: "npm test" },
          { exitCode: 1, output: "Error: test failed" },
          "agent-a"
        );
      });
    }

    // Main session (no agentId) succeeds
    act(() => {
      result.current.checkCommandResultLoop(
        "edit",
        { file_path: "/src/main.ts" },
        { exitCode: 0, output: "File edited successfully" }
      );
    });

    // Fork agent's third error still trips detection
    let loopRequest: CommandLoopRequest | null = null;
    act(() => {
      loopRequest = result.current.checkCommandResultLoop(
        "run_shell_command",
        { command: "npm test" },
        { exitCode: 1, output: "Error: test failed" },
        "agent-a"
      );
    });

    expect(loopRequest).not.toBeNull();
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
