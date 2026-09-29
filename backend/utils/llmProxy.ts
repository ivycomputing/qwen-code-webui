/**
 * Local LLM Proxy Server
 *
 * Intercepts LLM API requests from CLI subprocesses and injects the
 * X-Session-Id header before forwarding to the upstream LLM Proxy.
 *
 * This solves the session attribution problem in Open-ACE integration mode
 * where multiple Qwen sessions share the same user-level proxy token.
 *
 * Architecture:
 *   CLI subprocess → http://127.0.0.1:<port>/<sessionId>/v1/... → this proxy
 *   → upstream LLM Proxy (OPENAI_BASE_URL) with X-Session-Id header added
 *
 * @see https://github.com/ivycomputing/qwen-code-webui/issues/220
 */

import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";
import { logger } from "./logger.ts";
import { unrefTimer } from "./unrefTimer.ts";

let proxyServer: http.Server | null = null;
let proxyPort: number | null = null;
let upstreamBaseUrl: string | null = null;
// In-flight start, so concurrent startLlmProxy() calls share one server and one
// result instead of racing (a second caller must not resolve before the port is
// known). Reset to null once the start settles.
let startingPromise: Promise<number> | null = null;

/**
 * Start the local LLM proxy server.
 *
 * Concurrency: a start already in flight is reused, and a fully-started proxy
 * short-circuits, so repeated/parallel calls all resolve to the same port.
 *
 * @param upstreamUrl - The real LLM Proxy URL (from OPENAI_BASE_URL env var)
 * @returns The port number the proxy is listening on
 */
export function startLlmProxy(upstreamUrl: string): Promise<number> {
  // Fully started already — return the known port.
  if (proxyServer && proxyPort !== null) {
    logger.chat.warn("LLM proxy already running on port {port}", {
      port: proxyPort,
    });
    return Promise.resolve(proxyPort);
  }
  // A start is mid-flight — every concurrent caller awaits the same result.
  if (startingPromise) {
    return startingPromise;
  }

  startingPromise = new Promise<number>((resolve, reject) => {
    const server = http.createServer((clientReq, clientRes) => {
      handleProxyRequest(clientReq, clientRes);
    });
    proxyServer = server;

    // During startup, a bind error (e.g. EADDRINUSE) rejects the start.
    const onStartupError = (err: Error) => {
      logger.chat.error("LLM proxy server error: {error}", {
        error: err.message,
      });
      if (proxyServer === server) proxyServer = null;
      proxyPort = null;
      upstreamBaseUrl = null;
      startingPromise = null;
      reject(err);
    };
    server.once("error", onStartupError);

    // Listen on a random available port, localhost only (secure)
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr !== "object") {
        onStartupError(new Error("Failed to get proxy server address"));
        return;
      }
      proxyPort = addr.port;
      upstreamBaseUrl = upstreamUrl;
      startingPromise = null;
      // Swap the startup error handler for a long-lived one so a post-startup
      // server error is logged instead of crashing the process.
      server.removeListener("error", onStartupError);
      server.on("error", (err) => {
        logger.chat.error("LLM proxy server error: {error}", {
          error: err.message,
        });
      });
      logger.chat.info(
        "LLM proxy started on port {port}, upstream: {upstream}",
        { port: proxyPort, upstream: upstreamUrl },
      );
      resolve(proxyPort);
    });
  });

  return startingPromise;
}

/**
 * Handle a single proxy request:
 * 1. Extract session ID from URL path: /<sessionId>/v1/...
 * 2. Strip session ID from the forwarded path
 * 3. Add X-Session-Id header
 * 4. Forward to upstream
 * 5. Stream the response back
 */
function handleProxyRequest(
  clientReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
): void {
  // Wrap the whole handler: a synchronous throw here (e.g. `new URL(...)` on a
  // malformed upstream, or an invalid X-Session-Id header value rejected by
  // transport.request) would otherwise become an uncaughtException and crash
  // the entire backend instead of failing this one request.
  try {
    const reqUrl = clientReq.url || "";

    // Parse URL: /<sessionId>/v1/...
    // Split on '/' - first element is empty (leading /)
    const pathSegments = reqUrl.split("/");
    // pathSegments[0] = '' (before leading /)
    // pathSegments[1] = sessionId
    // pathSegments[2+] = remaining path (v1/...)

    const sessionId = pathSegments[1];
    // remainingPath always begins with "/", so it is never empty — only the
    // "/" (no path after the sessionId) case needs rejecting.
    const remainingPath = "/" + pathSegments.slice(2).join("/");

    if (!sessionId || remainingPath === "/") {
      logger.chat.warn("LLM proxy: invalid request URL: {url}", {
        url: reqUrl,
      });
      clientRes.writeHead(400, { "Content-Type": "text/plain" });
      clientRes.end("Invalid proxy URL format. Expected: /<sessionId>/v1/...");
      return;
    }

    if (!upstreamBaseUrl) {
      clientRes.writeHead(503, { "Content-Type": "text/plain" });
      clientRes.end("Proxy upstream not configured");
      return;
    }

    // Build upstream URL using string concatenation (matching OpenAI SDK behavior).
    // Using new URL(path, base) would lose the upstream's path prefix, e.g.:
    //   new URL("/v1/chat/completions", "http://host/custom/prefix") → "http://host/v1/chat/completions"
    // String concatenation preserves it:
    //   "http://host/custom/prefix" + "/v1/chat/completions" → "http://host/custom/prefix/v1/chat/completions"
    // Strip a trailing slash from the base first so a base like "http://host/v1/"
    // does not produce a doubled "//" in the forwarded path.
    // Note: remainingPath already includes the query string (if any) from the original URL
    // since we built it from path segments. No need to append it separately.
    const base = upstreamBaseUrl.endsWith("/")
      ? upstreamBaseUrl.slice(0, -1)
      : upstreamBaseUrl;
    const upstreamUrl = new URL(base + remainingPath);

    // SSRF guard: the destination origin must always be the configured upstream.
    // remainingPath comes from the request path (client-controlled) and always
    // starts with "/", so it can only affect the path — never the host. Pin the
    // origin explicitly anyway, so a malformed path can never redirect the
    // forwarded request to a different host/port than OPENAI_BASE_URL.
    if (upstreamUrl.origin !== new URL(base).origin) {
      logger.chat.warn(
        "LLM proxy: refusing to forward to unexpected origin {origin} (session: {sessionId})",
        { origin: upstreamUrl.origin, sessionId },
      );
      clientRes.writeHead(400, { "Content-Type": "text/plain" });
      clientRes.end("Invalid proxy target");
      return;
    }

    // Build headers for upstream request
    const upstreamHeaders: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(clientReq.headers)) {
      // Skip 'host' - it will be set correctly for the upstream
      if (key.toLowerCase() === "host") continue;
      // Skip 'connection' - not relevant for upstream
      if (key.toLowerCase() === "connection") continue;
      upstreamHeaders[key] = value;
    }

    // Add X-Session-Id header
    upstreamHeaders["x-session-id"] = sessionId;

    logger.chat.debug(
      "LLM proxy: {method} {path} → {upstream} (session: {sessionId})",
      {
        method: clientReq.method,
        path: remainingPath,
        upstream: upstreamUrl.toString(),
        sessionId,
      },
    );

    // Determine whether to use http or https for upstream
    const isHttps = upstreamUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    const proxyReq = transport.request(
      upstreamUrl,
      {
        method: clientReq.method,
        headers: upstreamHeaders as Record<string, string>,
      },
      (proxyRes) => {
        // Guard the upstream RESPONSE stream: a mid-stream reset (common for
        // long-lived SSE completions or an upstream restart) emits 'error' on
        // proxyRes. `.pipe()` does NOT forward source errors, so without this
        // listener the event is unhandled and crashes the backend. We cannot
        // recover a half-sent stream, so tear the client response down.
        proxyRes.on("error", (err) => {
          logger.chat.error(
            "LLM proxy: upstream response stream error: {error} (session: {sessionId})",
            { error: err.message, sessionId },
          );
          clientRes.destroy(err);
        });
        // Forward response headers to client
        clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        // Stream response body back to client
        proxyRes.pipe(clientRes);
      },
    );

    proxyReq.on("error", (err) => {
      logger.chat.error(
        "LLM proxy upstream error: {error} (session: {sessionId})",
        { error: err.message, sessionId },
      );
      // The client response may already be gone (e.g. this error is the result
      // of us aborting the upstream after the client disconnected). Writing to a
      // destroyed response would throw, so bail out first.
      if (clientRes.destroyed || clientRes.writableEnded) return;
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "Content-Type": "text/plain" });
        clientRes.end("Proxy upstream error: " + err.message);
      } else {
        // Response already started streaming; the only honest signal is to break
        // the connection so the client sees an incomplete stream.
        clientRes.destroy(err);
      }
    });

    // If the client request stream errors (CLI aborts mid-upload), tear down the
    // upstream request instead of letting an unhandled 'error' crash the process.
    clientReq.on("error", (err) => {
      logger.chat.warn(
        "LLM proxy: client request stream error: {error} (session: {sessionId})",
        { error: err.message, sessionId },
      );
      proxyReq.destroy(err);
    });

    // If the client disconnects before the response completes (user cancels a
    // streaming turn), abort the still-running upstream request so we don't keep
    // streaming to a dead socket and leak the upstream connection.
    clientRes.on("close", () => {
      if (!clientRes.writableFinished && !proxyReq.destroyed) {
        logger.chat.debug(
          "LLM proxy: client disconnected before response completed; aborting upstream (session: {sessionId})",
          { sessionId },
        );
        proxyReq.destroy();
      }
    });

    // Stream request body to upstream
    clientReq.pipe(proxyReq);
  } catch (err) {
    logger.chat.error("LLM proxy: unexpected error handling request: {error}", {
      error: err instanceof Error ? err.message : String(err),
    });
    if (clientRes.destroyed || clientRes.writableEnded) return;
    if (!clientRes.headersSent) {
      clientRes.writeHead(500, { "Content-Type": "text/plain" });
    }
    clientRes.end("Proxy internal error");
  }
}

/**
 * Get the proxy port. Returns null if proxy is not running.
 */
export function getProxyPort(): number | null {
  return proxyPort;
}

/**
 * Check if the proxy is running.
 */
export function isProxyRunning(): boolean {
  return proxyServer !== null && proxyPort !== null;
}

/**
 * Get the proxy base URL for a given session ID.
 * Returns null if proxy is not running.
 *
 * The returned URL is used as OPENAI_BASE_URL for the CLI subprocess.
 * The OpenAI SDK appends paths like /chat/completions via string concatenation,
 * so the proxy receives: /<sessionId>/chat/completions
 *
 * Note: Do NOT append /v1 here. The original OPENAI_BASE_URL may already
 * include /v1 or a custom path prefix, and we want the proxy to forward
 * the exact same path structure to the upstream.
 *
 * @param sessionId - The Qwen session ID
 * @returns The proxy base URL (e.g., http://127.0.0.1:12345/<sessionId>)
 */
export function getProxyBaseUrl(sessionId: string): string | null {
  if (!proxyPort) return null;
  return `http://127.0.0.1:${proxyPort}/${sessionId}`;
}

/**
 * Stop the LLM proxy server.
 *
 * If a start is still in flight, wait for it to finish binding first so we have
 * a real server to close and its start promise settles deterministically —
 * otherwise a start()-then-immediate-stop() sequence could leave the start
 * promise pending forever.
 */
export async function stopLlmProxy(): Promise<void> {
  const pendingStart = startingPromise;
  if (pendingStart) {
    // Let the in-flight start settle. If it failed to bind there is nothing to
    // close; either way we then read the resulting proxyServer below.
    try {
      await pendingStart;
    } catch {
      /* start failed — no server to close */
    }
  }

  const server = proxyServer;
  proxyServer = null;
  proxyPort = null;
  upstreamBaseUrl = null;
  startingPromise = null;

  if (!server) return;

  await new Promise<void>((resolve) => {
    // Force close after 5 seconds if connections are still open (e.g. a
    // long-lived SSE stream). unref() so this timer never keeps the process
    // alive on its own, and clear it once close() completes normally.
    const forceTimer = setTimeout(() => {
      server.closeAllConnections?.();
    }, 5000);
    unrefTimer(forceTimer);
    server.close(() => {
      clearTimeout(forceTimer);
      logger.chat.info("LLM proxy stopped");
      resolve();
    });
  });
}
