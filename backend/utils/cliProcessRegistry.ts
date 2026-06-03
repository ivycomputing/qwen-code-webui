import { AsyncLocalStorage } from "node:async_hooks";
import type { ChildProcess } from "node:child_process";
import { logger } from "./logger.ts";

const childProcess = require("node:child_process") as typeof import("node:child_process");

type AbortSource =
  | "user"
  | "stream_disconnect"
  | "request_superseded"
  | "server_shutdown"
  | "internal_abort";

interface TrackedRequest {
  requestId: string;
  sessionId?: string;
  cliPath?: string;
  children: Map<number, ChildProcess>;
  abortSource?: AbortSource;
  forceKillTimer?: ReturnType<typeof setTimeout>;
  requestEnded?: boolean;
}

const FORCE_KILL_AFTER_MS = 5_000;
const trackedRequests = new Map<string, TrackedRequest>();
const requestContext = new AsyncLocalStorage<{ requestId: string }>();

let patchInstalled = false;
let originalSpawn = childProcess.spawn;
let originalFork = childProcess.fork;

function isSdkCliSpawn(command: string, args: readonly string[]): boolean {
  return (
    args.includes("--channel=SDK")
    && args.includes("--input-format")
    && args.includes("stream-json")
    && args.includes("--output-format")
  );
}

function isSdkCliFork(modulePath: string, args: readonly string[]): boolean {
  return modulePath.includes("cli.js") && args.includes("--channel=SDK");
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findSessionCliPids(sessionId: string, cliPath?: string): number[] {
  try {
    const output = childProcess.execFileSync(
      "ps",
      ["-Ao", "pid=,command="],
      { encoding: "utf8" },
    );
    const matches = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (!match) return null;
        return { pid: Number(match[1]), command: match[2] };
      })
      .filter((entry): entry is { pid: number; command: string } => !!entry)
      .filter(({ command }) =>
        (!cliPath || command.includes(cliPath))
        && (
          command.includes(`--session-id ${sessionId}`)
          || command.includes(`--resume ${sessionId}`)
        )
      )
      .map(({ pid }) => pid);

    return matches;
  } catch (error) {
    logger.chat.warn(
      "[DIAG] Failed to scan process list for sessionId={sessionId}: {error}",
      { sessionId, error },
    );
    return [];
  }
}

function sendSignal(child: ChildProcess, signal: NodeJS.Signals, requestId: string): void {
  const pid = child.pid;
  if (!pid) return;

  try {
    process.kill(pid, signal);
    logger.chat.warn(
      "[DIAG] Sent signal={signal} to CLI pid={pid} requestId={requestId}",
      { signal, pid, requestId },
    );
  } catch (error) {
    logger.chat.warn(
      "[DIAG] Failed to send signal={signal} to CLI pid={pid} requestId={requestId}: {error}",
      { signal, pid, requestId, error },
    );
  }
}

function maybeClearForceKillTimer(state: TrackedRequest): void {
  if (state.children.size > 0 || !state.forceKillTimer) return;
  clearTimeout(state.forceKillTimer);
  state.forceKillTimer = undefined;
  if (state.requestEnded) {
    trackedRequests.delete(state.requestId);
  }
}

function attachChildToRequest(requestId: string, child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;

  const state = trackedRequests.get(requestId);
  if (!state) return;

  if (state.children.has(pid)) return;
  state.children.set(pid, child);

  logger.chat.info(
    "[DIAG] Tracking CLI pid={pid} requestId={requestId} sessionId={sessionId}",
    { pid, requestId, sessionId: state.sessionId },
  );

  const cleanup = () => {
    const current = trackedRequests.get(requestId);
    if (!current) return;
    current.children.delete(pid);
    maybeClearForceKillTimer(current);
  };

  child.once("close", cleanup);
  child.once("exit", cleanup);

  if (state.abortSource) {
    sendSignal(child, "SIGTERM", requestId);
  }
}

function installChildProcessPatch(): void {
  if (patchInstalled) return;
  patchInstalled = true;

  originalSpawn = childProcess.spawn;
  originalFork = childProcess.fork;
  const originalSpawnAny = originalSpawn as (...args: any[]) => ChildProcess;
  const originalForkAny = originalFork as (...args: any[]) => ChildProcess;

  childProcess.spawn = ((...args: any[]) => {
    const [command, spawnArgs] = args;
    const child = originalSpawnAny(...args);
    const requestId = requestContext.getStore()?.requestId;
    if (requestId && Array.isArray(spawnArgs) && isSdkCliSpawn(String(command), spawnArgs)) {
      attachChildToRequest(requestId, child);
    }
    return child;
  }) as unknown as typeof childProcess.spawn;

  childProcess.fork = ((...args: any[]) => {
    const [modulePath, forkArgs] = args;
    const child = originalForkAny(...args);
    const requestId = requestContext.getStore()?.requestId;
    if (requestId && Array.isArray(forkArgs) && isSdkCliFork(String(modulePath), forkArgs)) {
      attachChildToRequest(requestId, child);
    }
    return child;
  }) as unknown as typeof childProcess.fork;
}

export function registerTrackedCliRequest(
  requestId: string,
  options: { sessionId?: string; cliPath?: string } = {},
): void {
  installChildProcessPatch();
  trackedRequests.set(requestId, {
    requestId,
    sessionId: options.sessionId,
    cliPath: options.cliPath,
    children: new Map(),
  });
}

export function updateTrackedCliSessionId(requestId: string, sessionId: string): void {
  const state = trackedRequests.get(requestId);
  if (!state) return;
  state.sessionId = sessionId;
}

export function runWithTrackedCliRequest<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId }, fn);
}

export function signalTrackedCliAbort(
  requestId: string,
  source: AbortSource,
): void {
  const state = trackedRequests.get(requestId);
  if (!state) return;

  if (!state.abortSource) {
    state.abortSource = source;
    logger.chat.warn(
      "[DIAG] CLI abort requested requestId={requestId} source={source} trackedChildren={trackedChildren}",
      { requestId, source, trackedChildren: state.children.size },
    );
  }

  for (const child of state.children.values()) {
    sendSignal(child, "SIGTERM", requestId);
  }

  if (state.sessionId) {
    for (const pid of findSessionCliPids(state.sessionId, state.cliPath)) {
      try {
        process.kill(pid, "SIGTERM");
        logger.chat.warn(
          "[DIAG] Sent fallback signal=SIGTERM to CLI pid={pid} requestId={requestId}",
          { pid, requestId },
        );
      } catch (error) {
        logger.chat.warn(
          "[DIAG] Failed fallback SIGTERM pid={pid} requestId={requestId}: {error}",
          { pid, requestId, error },
        );
      }
    }
  }

  if (state.forceKillTimer) return;

  state.forceKillTimer = setTimeout(() => {
    const current = trackedRequests.get(requestId);
    if (!current) return;

    current.forceKillTimer = undefined;
    for (const [pid, child] of current.children) {
      if (!isPidAlive(pid)) continue;
      sendSignal(child, "SIGKILL", requestId);
    }
    if (current.sessionId) {
      for (const pid of findSessionCliPids(current.sessionId, current.cliPath)) {
        if (!isPidAlive(pid)) continue;
        try {
          process.kill(pid, "SIGKILL");
          logger.chat.warn(
            "[DIAG] Sent fallback signal=SIGKILL to CLI pid={pid} requestId={requestId}",
            { pid, requestId },
          );
        } catch (error) {
          logger.chat.warn(
            "[DIAG] Failed fallback SIGKILL pid={pid} requestId={requestId}: {error}",
            { pid, requestId, error },
          );
        }
      }
    }
    if (current.requestEnded) {
      trackedRequests.delete(requestId);
    }
  }, FORCE_KILL_AFTER_MS);

  if (state.forceKillTimer.unref) {
    state.forceKillTimer.unref();
  }
}

export function finalizeTrackedCliRequest(requestId: string): void {
  const state = trackedRequests.get(requestId);
  if (!state) return;

  if (state.forceKillTimer) {
    state.requestEnded = true;
    return;
  }

  trackedRequests.delete(requestId);
}

export function abortAllTrackedCliRequests(): void {
  for (const requestId of trackedRequests.keys()) {
    signalTrackedCliAbort(requestId, "server_shutdown");
  }
}

export const __cliProcessRegistryTestUtils = {
  attachChildToRequest,
  isSdkCliSpawn,
  isSdkCliFork,
  reset(): void {
    for (const state of trackedRequests.values()) {
      if (state.forceKillTimer) {
        clearTimeout(state.forceKillTimer);
      }
    }
    trackedRequests.clear();
  },
  getTrackedRequest(requestId: string): TrackedRequest | undefined {
    return trackedRequests.get(requestId);
  },
};
