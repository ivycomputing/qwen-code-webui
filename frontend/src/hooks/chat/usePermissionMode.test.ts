import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePermissionMode } from "./usePermissionMode";

describe("usePermissionMode", () => {
  it("should initialize with default permission mode", () => {
    const { result } = renderHook(() => usePermissionMode());

    expect(result.current.permissionMode).toBe("default");
    expect(result.current.isDefaultMode).toBe(true);
    expect(result.current.isPlanMode).toBe(false);
    expect(result.current.isAutoEditMode).toBe(false);
    expect(result.current.isYoloMode).toBe(false);
  });

  it("should update permission mode correctly", () => {
    const { result } = renderHook(() => usePermissionMode());

    act(() => {
      result.current.setPermissionMode("plan");
    });

    expect(result.current.permissionMode).toBe("plan");
    expect(result.current.isPlanMode).toBe(true);
    expect(result.current.isDefaultMode).toBe(false);
    expect(result.current.isAutoEditMode).toBe(false);
    expect(result.current.isYoloMode).toBe(false);
  });

  it("should handle auto-edit mode correctly", () => {
    const { result } = renderHook(() => usePermissionMode());

    act(() => {
      result.current.setPermissionMode("auto-edit");
    });

    expect(result.current.permissionMode).toBe("auto-edit");
    expect(result.current.isAutoEditMode).toBe(true);
    expect(result.current.isDefaultMode).toBe(false);
    expect(result.current.isPlanMode).toBe(false);
    expect(result.current.isYoloMode).toBe(false);
  });

  it("should handle yolo mode correctly", () => {
    const { result } = renderHook(() => usePermissionMode());

    act(() => {
      result.current.setPermissionMode("yolo");
    });

    expect(result.current.permissionMode).toBe("yolo");
    expect(result.current.isYoloMode).toBe(true);
    expect(result.current.isDefaultMode).toBe(false);
    expect(result.current.isPlanMode).toBe(false);
    expect(result.current.isAutoEditMode).toBe(false);
  });

  it("should persist state across re-renders", () => {
    const { result, rerender } = renderHook(() => usePermissionMode());

    act(() => {
      result.current.setPermissionMode("plan");
    });

    rerender();

    expect(result.current.permissionMode).toBe("plan");
    expect(result.current.isPlanMode).toBe(true);
  });

  it("should reset to default on new hook instance", () => {
    const { result: result1 } = renderHook(() => usePermissionMode());

    act(() => {
      result1.current.setPermissionMode("auto-edit");
    });

    // Create a new hook instance (simulating page reload)
    const { result: result2 } = renderHook(() => usePermissionMode());

    expect(result2.current.permissionMode).toBe("default");
    expect(result2.current.isDefaultMode).toBe(true);
  });
});
