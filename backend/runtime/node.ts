/**
 * Node.js runtime implementation
 *
 * Simplified implementation focusing only on platform-specific operations.
 */

import { spawn, type SpawnOptions } from "node:child_process";
import process from "node:process";
// Alias the import: the esbuild bundle banner already imports `createRequire`
// at top scope, and a duplicate top-level import of that name is a
// SyntaxError in the bundled ESM output (see #170).
import { createRequire as nodeCreateRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { serve } from "@hono/node-server";
import type { CommandResult, Runtime } from "./types.ts";
import type { MiddlewareHandler } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { getPlatform } from "../utils/os.ts";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

/**
 * Whether a command refers to a Windows script file (.cmd/.bat) that can
 * only be executed through cmd.exe.
 */
export function isWindowsScriptFile(command: string): boolean {
  return /\.(cmd|bat)$/i.test(command);
}

/**
 * Builds the cmd.exe argument vector for running a .cmd/.bat script.
 *
 * The full command line — the quoted command plus any quoted arguments —
 * is wrapped in one outer pair of quotes: `/d /s /c ""<command>" <args>"`.
 * /d disables AutoRun scripts; /s makes cmd strip only that outer pair,
 * leaving a well-quoted inner line even when paths contain spaces (e.g.
 * C:\Program Files\...). Without the outer quotes, /s would strip the
 * command's own quotes and cmd would split the path at its first space.
 */
export function buildWindowsCommandLine(
  command: string,
  args: string[],
): string[] {
  // The command itself is always quoted; arguments only when they contain
  // spaces (simple flags stay unquoted for readability).
  const quotedArgs = args.map((token) =>
    /\s/.test(token) ? `"${token}"` : token,
  );
  const line = [`"${command}"`, ...quotedArgs].join(" ");
  return ["/d", "/s", "/c", `"${line}"`];
}

export class NodeRuntime implements Runtime {
  async findExecutable(name: string): Promise<string[]> {
    const platform = getPlatform();
    const candidates: string[] = [];

    if (platform === "windows") {
      // Try multiple possible executable names on Windows
      const executableNames = [
        name,
        `${name}.exe`,
        `${name}.cmd`,
        `${name}.bat`,
      ];

      for (const execName of executableNames) {
        const result = await this.runCommand("where", [execName]);
        if (result.success && result.stdout.trim()) {
          // where command can return multiple paths, split by newlines
          const paths = result.stdout
            .trim()
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => p);
          candidates.push(...paths);
        }
      }
    } else {
      // Unix-like systems (macOS, Linux)
      const result = await this.runCommand("which", [name]);
      if (result.success && result.stdout.trim()) {
        candidates.push(result.stdout.trim());
      }
    }

    return candidates;
  }

  runCommand(
    command: string,
    args: string[],
    options?: {
      env?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const isWindows = getPlatform() === "windows";
      const spawnOptions: SpawnOptions = {
        stdio: ["ignore", "pipe", "pipe"],
        env: options?.env ? { ...process.env, ...options.env } : process.env,
      };

      // On Windows only .cmd/.bat scripts need cmd.exe (they cannot be
      // spawned directly); the command line is quoted as one string so paths
      // with spaces survive cmd's re-parsing. Real executables spawn
      // directly — Node quotes arguments correctly for CreateProcess, which
      // also handles paths with spaces without any cmd.exe involvement.
      let actualCommand = command;
      let actualArgs = args;

      if (isWindows && isWindowsScriptFile(command)) {
        actualCommand = "cmd.exe";
        actualArgs = buildWindowsCommandLine(command, args);
        // The whole command line is one pre-quoted argument; without this
        // Node would re-quote it (escaping the inner quotes as \"), which
        // cmd's parser cannot read.
        spawnOptions.windowsVerbatimArguments = true;
      }

      const child = spawn(actualCommand, actualArgs, spawnOptions);

      const textDecoder = new TextDecoder();
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timeout = options?.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            // Windows .cmd/.bat scripts run via `cmd.exe /c`, where
            // child.kill() only terminates cmd.exe and leaves grandchildren
            // alive (still holding the stdio pipes). Kill the whole tree in
            // that case, then destroy our ends of the pipes so 'close' — and
            // this promise — cannot hang. Directly-spawned executables can
            // be killed with SIGKILL.
            if (isWindows && child.pid) {
              spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
            } else {
              child.kill("SIGKILL");
            }
            child.stdout?.destroy();
            child.stderr?.destroy();
          }, options.timeoutMs)
        : null;

      child.stdout?.on("data", (data: Uint8Array) => {
        stdout += textDecoder.decode(data, { stream: true });
      });

      child.stderr?.on("data", (data: Uint8Array) => {
        stderr += textDecoder.decode(data, { stream: true });
      });

      child.on("close", (code: number | null) => {
        if (timeout) clearTimeout(timeout);
        resolve({
          success: code === 0 && !timedOut,
          code: timedOut ? 124 : (code ?? 1),
          stdout,
          stderr: timedOut
            ? stderr
              ? `${stderr}\ncommand timed out`
              : "command timed out"
            : stderr,
        });
      });

      child.on("error", (error: Error) => {
        if (timeout) clearTimeout(timeout);
        resolve({
          success: false,
          code: 1,
          stdout: "",
          stderr: error.message,
        });
      });
    });
  }

  /**
   * Resolve the Qwen CLI bundled inside the @qwen-code/sdk package
   * (dist/cli/cli.js). Returns null when the SDK or its bundled CLI is not
   * present on disk, e.g. when the package was installed without deps.
   */
  resolveBundledCliPath(): string | null {
    try {
      const require = nodeCreateRequire(import.meta.url);
      const sdkPackageJson = require.resolve("@qwen-code/sdk/package.json");
      const cliPath = join(dirname(sdkPackageJson), "dist", "cli", "cli.js");
      return existsSync(cliPath) ? cliPath : null;
    } catch {
      return null;
    }
  }

  async serve(
    port: number,
    hostname: string,
    handler: (req: Request, env?: unknown) => Response | Promise<Response>,
  ): Promise<void> {
    // Pass handler directly to @hono/node-server so that
    // { incoming, outgoing } Node.js bindings are available as c.env
    // in Hono handlers. The previous double-wrapping via a separate
    // Hono().all("*", ...) discarded these bindings.
    const server = serve({
      fetch: handler,
      port,
      hostname,
      serverOptions: {
        // Disable timeouts for long-running streaming/SSE responses
        headersTimeout: 0,
        requestTimeout: 0,
        keepAliveTimeout: 0,
      },
    });

    console.log(`Listening on http://${hostname}:${port}/`);

    // Register WebSocket upgrade handler (e.g., for VS Code proxy)
    if (this._upgradeHandler) {
      server.on("upgrade", this._upgradeHandler);
    }

    // Keep the server instance alive to prevent process exit
    // This ensures the Node.js event loop remains active
    this._server = server;
  }

  private _server?: import("@hono/node-server").ServerType;
  private _upgradeHandler:
    | ((req: IncomingMessage, socket: Duplex, head: Buffer) => void)
    | null = null;

  onUpgrade(
    handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void,
  ) {
    this._upgradeHandler = handler;
  }

  createStaticFileMiddleware(options: { root: string }): MiddlewareHandler {
    return serveStatic(options);
  }
}
