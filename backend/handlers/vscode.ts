import { Context } from "hono";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import httpProxy from "http-proxy";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import process from "node:process";
import os from "node:os";
import type { AppConfig } from "../types.ts";
import { logger } from "../utils/logger.ts";
import { readProjectPathMapping } from "../utils/projectMapping.ts";

interface VSCodeProcess {
  childProcess: ChildProcess | null;
  pid: number;
  port: number;
  workingDirectory: string;
}

interface LockInfo {
  pid: number;
  port: number;
  workingDirectory: string;
  startedAt: number;
}

// In-memory state for code-server process
let vscodeProcess: VSCodeProcess | null = null;

// File lock utilities for multi-user/multi-session deduplication
function getLockFilePath(wd: string): string {
  const hash = createHash("md5").update(wd).digest("hex").slice(0, 12);
  return resolve(os.tmpdir(), `code-server-${hash}.lock`);
}

function readLockFile(wd: string): LockInfo | null {
  try {
    const path = getLockFilePath(wd);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeLockFile(wd: string, info: LockInfo) {
  writeFileSync(getLockFilePath(wd), JSON.stringify(info));
}

function removeLockFile(wd: string) {
  try {
    unlinkSync(getLockFilePath(wd));
  } catch {}
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isSameWorkingDirectory(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

async function stopOwnedVSCodeProcess(
  processInfo: VSCodeProcess,
  waitForExit = false,
) {
  if (!processInfo.childProcess) return;

  removeLockFile(processInfo.workingDirectory);

  const child = processInfo.childProcess;
  const pid = processInfo.pid;

  let exitPromise: Promise<void> | null = null;
  if (waitForExit) {
    exitPromise = new Promise((resolveExit) => {
      child.once("exit", () => resolveExit());
      child.once("close", () => resolveExit());
    });
  }

  child.kill("SIGTERM");
  setTimeout(() => {
    try {
      if (isProcessAlive(pid)) {
        child.kill("SIGKILL");
      }
    } catch {}
  }, 5000);

  if (exitPromise) {
    await Promise.race([
      exitPromise,
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2000)),
    ]);
  }
}

async function findCodeServer(
  runtime: AppConfig["runtime"],
): Promise<string | null> {
  try {
    const paths = await runtime.findExecutable("code-server");
    return paths.length > 0 ? paths[0] : null;
  } catch {
    return null;
  }
}

export async function handleVSCodeStartRequest(c: Context) {
  const config = c.var.config as AppConfig;
  const workingDirectory = c.req.query("workingDirectory");

  if (!workingDirectory) {
    return c.json({ error: "workingDirectory is required" }, 400);
  }

  // Validate workingDirectory against known project list
  const mapping = await readProjectPathMapping();
  const knownPaths = Object.values(mapping);
  if (knownPaths.length > 0) {
    const resolved = resolve(workingDirectory);
    if (!knownPaths.some((p) => resolve(p) === resolved)) {
      return c.json({ error: "workingDirectory is not a known project" }, 403);
    }
  }

  // Check in-memory state first (same backend process, different session)
  if (vscodeProcess && isProcessAlive(vscodeProcess.pid)) {
    if (
      isSameWorkingDirectory(vscodeProcess.workingDirectory, workingDirectory)
    ) {
      return c.json({
        port: vscodeProcess.port,
        url: "/vscode/",
        alreadyRunning: true,
      });
    }

    logger.app.info(
      "Restarting VS Code server for requested working directory",
    );
    const previousProcess = vscodeProcess;
    vscodeProcess = null;
    await stopOwnedVSCodeProcess(previousProcess, true);
  } else if (vscodeProcess) {
    removeLockFile(vscodeProcess.workingDirectory);
    vscodeProcess = null;
  }

  // Check lock file for existing instance (multi-user/multi-session across processes)
  const lock = readLockFile(workingDirectory);
  if (lock && isProcessAlive(lock.pid)) {
    vscodeProcess = {
      childProcess: null, // We don't own the process
      pid: lock.pid,
      port: lock.port,
      workingDirectory,
    };
    logger.app.info("Reusing existing code-server on port {port}", {
      port: lock.port,
    });
    return c.json({ port: lock.port, url: "/vscode/", alreadyRunning: true });
  } else if (lock) {
    removeLockFile(workingDirectory); // Stale lock
  }

  try {
    const codeServerPath = await findCodeServer(config.runtime);
    if (!codeServerPath) {
      return c.json(
        {
          error:
            "code-server is not installed. Install with: curl -fsSL https://code-server.dev/install.sh | sh",
        },
        404,
      );
    }

    // Spawn code-server as background process (don't wait for exit)
    const child = spawn(
      codeServerPath,
      [
        "--port",
        "0",
        "--auth",
        "none",
        "--disable-telemetry",
        "--disable-update-check",
        "--disable-workspace-trust",
        "--disable-getting-started-override",
        workingDirectory,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BROWSER: "none" },
      },
    );

    // Stream stdout/stderr to detect port (with 30s timeout)
    const port = await new Promise<number | null>((resolvePort) => {
      const timeout = setTimeout(() => resolvePort(null), 30_000);
      const regex = /https?:\/\/[\d.]+:(\d+)/;
      let output = "";

      const check = (data: string) => {
        output += data;
        const m = output.match(regex);
        if (m) {
          clearTimeout(timeout);
          resolvePort(parseInt(m[1], 10));
        }
      };

      child.stdout?.on("data", (d: Buffer) => check(d.toString()));
      child.stderr?.on("data", (d: Buffer) => check(d.toString()));
      child.on("error", () => {
        clearTimeout(timeout);
        resolvePort(null);
      });
      child.on("close", () => {
        clearTimeout(timeout);
        resolvePort(null);
      });
    });

    if (!port) {
      child.kill();
      return c.json(
        { error: "Failed to start code-server (timeout or port not found)" },
        500,
      );
    }

    vscodeProcess = {
      childProcess: child,
      pid: child.pid!,
      port,
      workingDirectory,
    };

    // Write lock file for deduplication
    writeLockFile(workingDirectory, {
      pid: child.pid!,
      port,
      workingDirectory,
      startedAt: Date.now(),
    });

    // Cleanup on unexpected exit
    child.on("exit", () => {
      if (vscodeProcess?.port === port) {
        vscodeProcess = null;
        removeLockFile(workingDirectory);
      }
    });

    logger.app.info("VS Code server started on port {port}", { port });
    return c.json({ port, url: "/vscode/" });
  } catch (error) {
    logger.app.error("VS Code start error: {error}", { error });
    return c.json({ error: "Failed to start VS Code" }, 500);
  }
}

export async function handleVSCodeStopRequest(c: Context) {
  if (!vscodeProcess) {
    return c.json({ success: true, message: "Not running" });
  }

  const previousProcess = vscodeProcess;

  // Clear state immediately
  vscodeProcess = null;

  // Kill the code-server process
  void stopOwnedVSCodeProcess(previousProcess);

  logger.app.info("VS Code server stopped");
  return c.json({ success: true });
}

export async function handleVSCodeStatusRequest(c: Context) {
  if (!vscodeProcess) {
    return c.json({ running: false });
  }

  return c.json({
    running: true,
    port: vscodeProcess.port,
    url: "/vscode/",
    workingDirectory: vscodeProcess.workingDirectory,
  });
}

// Get the current code-server port for proxying
export function getVSCodePort(): number | null {
  return vscodeProcess?.port ?? null;
}

// Stop code-server (called on server shutdown)
export function stopVSCodeServer() {
  if (vscodeProcess) {
    try {
      vscodeProcess.childProcess?.kill("SIGTERM");
      removeLockFile(vscodeProcess.workingDirectory);
    } catch {}
    vscodeProcess = null;
  }
}

// Create a shared http-proxy instance for VS Code proxying
const vscodeProxy = httpProxy.createProxyServer({
  ws: true,
  changeOrigin: true,
});

vscodeProxy.on("error", (err, _req, _res) => {
  logger.app.error("VS Code proxy error: {error}", { error: err.message });
});

// WebSocket upgrade handler for VS Code proxy
export function createVSCodeUpgradeHandler() {
  return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const port = getVSCodePort();
    if (!port || !req.url?.startsWith("/vscode")) {
      socket.destroy();
      return;
    }

    req.url = req.url.replace(/^\/vscode\/?/, "/") || "/";

    vscodeProxy.ws(req, socket, head, {
      target: `http://localhost:${port}`,
      headers: {
        host: `localhost:${port}`,
        origin: `http://localhost:${port}`,
      },
    });
  };
}
