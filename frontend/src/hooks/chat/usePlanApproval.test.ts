import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePermissions } from "./usePermissions";
import { createExitPlanModeToolUseWithId } from "../../utils/mockResponseGenerator";
import { TOOL_NAMES } from "../../utils/toolNames";

function usePlanApprovalWorkflow() {
  const permissions = usePermissions();

  const handlePlanPermissionRequest = (planContent: string, toolUseId = "plan-123") => {
    const assistantMessage = createExitPlanModeToolUseWithId(
      "session-123",
      toolUseId,
      planContent,
    );
    const toolUse = assistantMessage.message.content.find(
      (item) => item.type === "tool_use",
    );

    if (toolUse?.type !== "tool_use" || toolUse.name !== TOOL_NAMES.EXIT_PLAN_MODE) {
      throw new Error("Expected ExitPlanMode tool_use");
    }

    permissions.showPlanModeRequest(
      typeof (toolUse.input as Record<string, unknown>).plan === "string"
        ? (toolUse.input as Record<string, unknown>).plan as string
        : "",
    );

    return toolUse;
  };

  return {
    ...permissions,
    handlePlanPermissionRequest,
  };
}

describe("Plan Approval Workflow", () => {
  it("creates an ExitPlanMode tool_use with the expected plan content", () => {
    const assistantMessage = createExitPlanModeToolUseWithId(
      "session-123",
      "plan-456",
      "1. Inspect files\n2. Update tests",
    );

    expect(assistantMessage.type).toBe("assistant");
    expect(assistantMessage.session_id).toBe("session-123");
    expect(assistantMessage.message.content).toEqual([
      {
        type: "tool_use",
        id: "plan-456",
        name: TOOL_NAMES.EXIT_PLAN_MODE,
        input: {
          plan: "1. Inspect files\n2. Update tests",
        },
      },
    ]);
  });

  it("opens plan approval directly from the proactive ExitPlanMode request", () => {
    const { result } = renderHook(() => usePlanApprovalWorkflow());

    let toolUse;
    act(() => {
      toolUse = result.current.handlePlanPermissionRequest(
        "1. Inspect files\n2. Update tests",
        "plan-789",
      );
    });

    expect(toolUse).toEqual({
      type: "tool_use",
      id: "plan-789",
      name: TOOL_NAMES.EXIT_PLAN_MODE,
      input: {
        plan: "1. Inspect files\n2. Update tests",
      },
    });
    expect(result.current.permissionRequest).toBeNull();
    expect(result.current.planModeRequest).toEqual({
      isOpen: true,
      planContent: "1. Inspect files\n2. Update tests",
    });
    expect(result.current.isPermissionMode).toBe(true);
  });

  it("supports empty plan content without falling back to reactive tool_result handling", () => {
    const { result } = renderHook(() => usePlanApprovalWorkflow());

    act(() => {
      result.current.handlePlanPermissionRequest("", "plan-empty");
    });

    expect(result.current.permissionRequest).toBeNull();
    expect(result.current.planModeRequest).toEqual({
      isOpen: true,
      planContent: "",
    });
  });

  it("closes the plan approval dialog and exits permission mode", () => {
    const { result } = renderHook(() => usePlanApprovalWorkflow());

    act(() => {
      result.current.handlePlanPermissionRequest("Review the repository");
    });

    act(() => {
      result.current.closePlanModeRequest();
    });

    expect(result.current.planModeRequest).toBeNull();
    expect(result.current.isPermissionMode).toBe(false);
  });
});
