import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __cliProcessRegistryTestUtils,
  finalizeTrackedCliRequest,
  registerTrackedCliRequest,
  signalTrackedCliAbort,
} from "./cliProcessRegistry.ts";

vi.mock("./logger.ts", () => ({
  logger: {
    chat: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

class FakeChildProcess extends EventEmitter {
  pid: number;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }
}

describe("cliProcessRegistry", () => {
  let alivePids: Set<number>;
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    alivePids = new Set<number>();
    __cliProcessRegistryTestUtils.reset();

    killSpy = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: number | NodeJS.Signals) => {
      if (signal === 0 || signal === undefined) {
        if (!alivePids.has(pid)) {
          throw new Error(`process ${pid} missing`);
        }
        return true;
      }

      if (!alivePids.has(pid)) {
        throw new Error(`process ${pid} missing`);
      }

      if (signal === "SIGKILL") {
        alivePids.delete(pid);
      }
      return true;
    }) as typeof process.kill);
  });

  afterEach(() => {
    killSpy.mockRestore();
    vi.useRealTimers();
    __cliProcessRegistryTestUtils.reset();
  });

  it("escalates to SIGKILL when a tracked CLI survives SIGTERM", () => {
    registerTrackedCliRequest("req-1", { sessionId: "session-1" });

    const child = new FakeChildProcess(4242);
    alivePids.add(child.pid);
    __cliProcessRegistryTestUtils.attachChildToRequest("req-1", child as unknown as import("node:child_process").ChildProcess);

    signalTrackedCliAbort("req-1", "user");

    expect(killSpy).toHaveBeenCalledWith(4242, "SIGTERM");

    vi.advanceTimersByTime(5_000);

    expect(killSpy).toHaveBeenCalledWith(4242, "SIGKILL");
  });

  it("clears abort timers when the tracked CLI exits before escalation", () => {
    registerTrackedCliRequest("req-2");

    const child = new FakeChildProcess(5252);
    alivePids.add(child.pid);
    __cliProcessRegistryTestUtils.attachChildToRequest("req-2", child as unknown as import("node:child_process").ChildProcess);

    signalTrackedCliAbort("req-2", "user");
    alivePids.delete(child.pid);
    child.emit("close");

    vi.advanceTimersByTime(5_000);

    expect(killSpy).toHaveBeenCalledTimes(1);
    finalizeTrackedCliRequest("req-2");
  });
  it("closes only an aborted child's stdio after process exit", () => {
    registerTrackedCliRequest("req-pipes");
    const child = new FakeChildProcess(6262);
    Object.assign(child, {
      stdin: { destroy: vi.fn() },
      stdout: { destroy: vi.fn() },
      stderr: { destroy: vi.fn() },
    });
    alivePids.add(child.pid);
    __cliProcessRegistryTestUtils.attachChildToRequest("req-pipes", child as any);
    signalTrackedCliAbort("req-pipes", "user");
    child.emit("exit");
    for (const stream of ["stdin", "stdout", "stderr"]) {
      expect((child as any)[stream].destroy).toHaveBeenCalledOnce();
    }
  });

  it("preserves buffered output on normal process exit", () => {
    registerTrackedCliRequest("req-normal");
    const child = new FakeChildProcess(7272);
    Object.assign(child, { stdout: { destroy: vi.fn() } });
    __cliProcessRegistryTestUtils.attachChildToRequest("req-normal", child as any);
    child.emit("exit");
    expect((child as any).stdout.destroy).not.toHaveBeenCalled();
  });

  it("exposes the patched spawn to consumers that imported it as an ESM binding", async () => {
    // The probe may be linked before or after the patch installs;
    // currentSpawn() reads the live ESM binding, so the assertion only holds
    // when syncBuiltinESMExports refreshed an already-linked import.
    const probe = await import("./esmSpawnProbe.ts");
    registerTrackedCliRequest("req-esm");
    const require = (await import("node:module")).createRequire(import.meta.url);
    expect(probe.currentSpawn()).toBe(require("node:child_process").spawn);
  });
});
