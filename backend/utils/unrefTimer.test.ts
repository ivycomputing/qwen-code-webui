/**
 * Tests for the unrefTimer cross-runtime timer helper.
 *
 * Under Node typings setTimeout() returns a NodeJS.Timeout with unref();
 * under Deno's lib config it returns a plain number. The helper hides that
 * difference so shared code can unref timers without TS2339 errors
 * (continues the explicit-type cleanup started in #276).
 */

import { describe, it, expect, vi } from "vitest";
import { unrefTimer } from "./unrefTimer.ts";

describe("unrefTimer", () => {
  it("calls unref() when the timer exposes it", () => {
    const unref = vi.fn();
    unrefTimer({ unref } as unknown as ReturnType<typeof setTimeout>);
    expect(unref).toHaveBeenCalledOnce();
  });

  it("does not throw when unref is absent (Deno numbers)", () => {
    expect(() =>
      unrefTimer(42 as unknown as ReturnType<typeof setTimeout>),
    ).not.toThrow();
  });

  it("works on a real Node timer", () => {
    const timer = setTimeout(() => {}, 60_000);
    expect(() => unrefTimer(timer)).not.toThrow();
    clearTimeout(timer);
  });
});
