import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PermissionInputPanel } from "./PermissionInputPanel";
import "../../i18n"; // Initialize i18n for tests

/**
 * Pins the Allow-All button rendering contract behind the remote-mode fix
 * for #233: the command-scoped button set (Only allow <cmd> / Allow <cmd>,
 * and don't ask again for any run_shell_command) renders only for shell
 * commands with an onAllowAll handler — which ChatPage now provides for
 * remote sessions too (permissionId || isRemoteWorkspace).
 */
describe("PermissionInputPanel Allow-All rendering", () => {
  const baseProps = {
    patterns: ["run_shell_command:npm"],
    toolName: "run_shell_command",
    toolInput: { command: "npm test" },
    onAllow: vi.fn(),
    onAllowPermanent: vi.fn(),
    onDeny: vi.fn(),
  };

  it("renders the Allow-All option for shell commands when onAllowAll is provided", () => {
    render(<PermissionInputPanel {...baseProps} onAllowAll={vi.fn()} />);

    expect(screen.getByText("Only allow npm")).toBeInTheDocument();
    expect(
      screen.getByText("Allow npm, and don't ask again for any run_shell_command"),
    ).toBeInTheDocument();
  });

  it("does not render the Allow-All option when onAllowAll is absent", () => {
    render(<PermissionInputPanel {...baseProps} />);

    expect(screen.queryByText("Only allow npm")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/for any run_shell_command/),
    ).not.toBeInTheDocument();
    // Generic fallback (allow once / permanent / deny) still renders
    expect(screen.getByText("Allow this time")).toBeInTheDocument();
    expect(
      screen.getByText("Yes, and don't ask again for run_shell_command(npm) command"),
    ).toBeInTheDocument();
  });

  it("does not render the Allow-All option for non-shell tools even with onAllowAll", () => {
    render(
      <PermissionInputPanel
        {...baseProps}
        toolName="edit"
        toolInput={{ file_path: "/src/a.ts" }}
        onAllowAll={vi.fn()}
      />,
    );

    expect(screen.queryByText(/for any run_shell_command/)).not.toBeInTheDocument();
  });
});


describe("PermissionInputPanel deadline", () => {
  it("denies exactly once without invoking either approval callback", async () => {
    vi.useFakeTimers();
    const onAllow = vi.fn(); const onAllowPermanent = vi.fn(); const onDeny = vi.fn();
    const view = render(<PermissionInputPanel patterns={[]} onAllow={onAllow}
      onAllowPermanent={onAllowPermanent} onDeny={onDeny} permissionTimeoutMs={2000} />);
    try {
      await act(async () => { vi.advanceTimersByTime(3000); });
      expect(onDeny).toHaveBeenCalledOnce();
      expect(onAllow).not.toHaveBeenCalled();
      expect(onAllowPermanent).not.toHaveBeenCalled();
    } finally { view.unmount(); vi.useRealTimers(); }
  });
});
