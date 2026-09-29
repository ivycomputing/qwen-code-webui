/**
 * Deno runtime implementation
 *
 * Simplified implementation focusing only on platform-specific operations.
 */

import type { CommandResult, Runtime } from "./types.ts";
import type { MiddlewareHandler } from "hono";
import { serveStatic } from "hono/deno";
import { getPlatform } from "../utils/os.ts";

/**
 * Whether a command refers to a Windows script file (.cmd/.bat) that can
 * only be executed through cmd.exe. Mirrors the helper in runtime/node.ts,
 * duplicated here because the Node runtime module is not part of the Deno
 * module graph.
 */
function isWindowsScriptFile(command: string): boolean {
  return /\.(cmd|bat)$/i.test(command);
}

/**
 * Relays a WebSocket upgrade request to a backend WebSocket endpoint
 * (the Deno counterpart of the Node http-proxy upgrade handler).
 *
 * Messages are piped bidirectionally; client frames sent before the upstream
 * socket opens are buffered so nothing is dropped during the connect window.
 * The upstream close code/reason is forwarded to the client when it is a
 * sendable code.
 *
 * Data forwarded from the client: message payload and (single) subprotocol.
 * Not forwarded: origin, cookies and other headers — the Deno WebSocket
 * client API cannot set them. code-server only rejects *mismatched*
 * origins, so the no-origin upgrade works there (verified against a live
 * code-server); other upstreams with stricter policies would need a
 * different design.
 *
 * @param req - The upgrade request received inside Deno.serve
 * @param getTarget - Resolves the proxy target for the request path; a null
 *   result answers the client with 503 (mirroring socket.destroy() on Node)
 */
export async function relayWebSocket(
  req: Request,
  getTarget: (
    requestPath: string,
  ) => { httpUrl: string; path: string } | null,
): Promise<Response> {
  const url = new URL(req.url);
  const target = getTarget(url.pathname + url.search);
  if (!target) {
    return new Response("WebSocket proxy unavailable", { status: 503 });
  }

  // A comma-separated Sec-WebSocket-Protocol offers several candidates;
  // forward the list upstream and negotiate the first one server-side
  // (Deno.upgradeWebSocket only accepts a single protocol).
  const offeredProtocols = (req.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const negotiatedProtocol = offeredProtocols[0];
  const { response, socket } = Deno.upgradeWebSocket(
    req,
    negotiatedProtocol ? { protocol: negotiatedProtocol } : {},
  );

  const upstreamUrl = target.httpUrl.replace(/^http/, "ws") + target.path;
  const upstream = new WebSocket(
    upstreamUrl,
    offeredProtocols.length > 0 ? offeredProtocols : undefined,
  );
  socket.binaryType = "arraybuffer";
  upstream.binaryType = "arraybuffer";

  // Frames from the browser can arrive before the upstream socket connects;
  // buffer them and flush on open. When the client closes with frames still
  // buffered they are dropped deliberately: flushing to a possibly-dead
  // upstream could raise spurious errors for no benefit.
  const pending: (string | ArrayBuffer)[] = [];
  let upstreamOpen = false;

  const closeBoth = () => {
    try {
      socket.close();
    } catch {
      // already closing
    }
    try {
      upstream.close();
    } catch {
      // already closing
    }
  };

  // Codes that RFC 6455 allows a peer to SEND: 1000-1011 except the
  // reserved 1005/1006, plus the 3000-4999 application range. Anything
  // else (notably 1005 "no code" and 1006 "abnormal") cannot be forwarded.
  const forwardableCloseCode = (code: number): boolean =>
    (code >= 1000 && code <= 1011 && code !== 1005 && code !== 1006) ||
    (code >= 3000 && code <= 4999);

  // Set when the client socket closes before the upstream handshake
  // completes — upstream.close() during CONNECTING does not abort an
  // already-dispatched handshake on Deno, so onopen must close it instead.
  let clientClosed = false;

  upstream.onopen = () => {
    upstreamOpen = true;
    if (clientClosed) {
      try {
        upstream.close();
      } catch {
        // already closing
      }
      return;
    }
    for (const data of pending) upstream.send(data);
    pending.length = 0;
  };
  upstream.onmessage = (event) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(event.data);
  };
  socket.onmessage = (event) => {
    if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
      upstream.send(event.data);
    } else if (!upstreamOpen) {
      pending.push(event.data as string | ArrayBuffer);
    }
  };
  socket.onclose = () => {
    pending.length = 0;
    clientClosed = true;
    try {
      upstream.close();
    } catch {
      // already closing
    }
  };
  upstream.onclose = (event) => {
    pending.length = 0;
    try {
      if (forwardableCloseCode(event.code)) {
        socket.close(event.code, event.reason);
      } else {
        socket.close();
      }
    } catch {
      // already closing
    }
  };
  socket.onerror = closeBoth;
  upstream.onerror = closeBoth;

  return response;
}

export class DenoRuntime implements Runtime {
  private wsRelay:
    | ((req: Request) => Promise<Response> | Response)
    | null = null;

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

  async runCommand(
    command: string,
    args: string[],
    options?: {
      env?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<CommandResult> {
    const platform = getPlatform();

    // On Windows only .cmd/.bat scripts go through cmd.exe. Arguments are
    // passed separately: Deno quotes each one itself, and a pre-quoted
    // single command line would get double-escaped (NodeRuntime instead
    // uses windowsVerbatimArguments, which Deno.Command does not expose).
    let actualCommand = command;
    let actualArgs = args;

    if (platform === "windows" && isWindowsScriptFile(command)) {
      actualCommand = "cmd.exe";
      actualArgs = ["/d", "/c", command, ...args];
    }

    try {
      const cmd = new Deno.Command(actualCommand, {
        args: actualArgs,
        stdout: "piped",
        stderr: "piped",
        env: options?.env,
        signal: options?.timeoutMs
          ? AbortSignal.timeout(options.timeoutMs)
          : undefined,
      });

      const result = await cmd.output();

      return {
        success: result.success,
        code: result.code,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: new TextDecoder().decode(result.stderr),
      };
    } catch (error) {
      // AbortSignal.timeout() rejects output() with a TimeoutError DOMException
      // when the command overruns timeoutMs; other failures (e.g. command not
      // found) land here too. Report as a failed command instead of crashing
      // startup, using 124 (the conventional timeout code) only for timeouts.
      const isTimeout = error instanceof DOMException &&
        error.name === "TimeoutError";
      return {
        success: false,
        code: isTimeout ? 124 : 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Registers the WebSocket upgrade relay. Must be called before serve().
   * This is the Deno counterpart of NodeRuntime.onUpgrade: instead of an
   * http server 'upgrade' event, upgrade requests are intercepted inside
   * the Deno.serve fetch handler.
   */
  onUpgrade(relay: (req: Request) => Promise<Response> | Response): void {
    this.wsRelay = relay;
  }

  serve(
    port: number,
    hostname: string,
    handler: (req: Request, env?: unknown) => Response | Promise<Response>,
  ): Promise<void> {
    const dispatch = (req: Request): Response | Promise<Response> => {
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (isUpgrade && this.wsRelay) {
        return this.wsRelay(req);
      }
      return handler(req);
    };
    const server = Deno.serve({ port, hostname }, dispatch);
    // Return the finished promise which resolves when server closes
    return server.finished;
  }

  createStaticFileMiddleware(options: { root: string }): MiddlewareHandler {
    return serveStatic(options);
  }
}
