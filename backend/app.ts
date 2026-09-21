/**
 * Runtime-agnostic Hono application
 *
 * This module creates the Hono application with all routes and middleware,
 * but doesn't include runtime-specific code like CLI parsing or server startup.
 */

import { Buffer } from "node:buffer";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Runtime } from "./runtime/types.ts";
import {
  type ConfigContext,
  createConfigMiddleware,
} from "./middleware/config.ts";
import { createTokenAuthMiddleware } from "./middleware/tokenAuth.ts";
import { handleProjectsRequest } from "./handlers/projects.ts";
import { handleHistoriesRequest } from "./handlers/histories.ts";
import { handleConversationRequest } from "./handlers/conversations.ts";
import { handleChatRequest } from "./handlers/chat.ts";
import { handleAbortRequest } from "./handlers/abort.ts";
import {
  handlePermissionRespond,
  type PendingPermission,
} from "./handlers/permission.ts";
import { handleVersionRequest } from "./handlers/version.ts";
import { handleModelsRequest } from "./handlers/models.ts";
import {
  handleQuotaStatusRequest,
  quotaCheckMiddleware,
} from "./handlers/quota.ts";
import { logger } from "./utils/logger.ts";
import { readBinaryFile } from "./utils/fs.ts";
import { abortAllTrackedCliRequests } from "./utils/cliProcessRegistry.ts";
import { startLlmProxy, stopLlmProxy } from "./utils/llmProxy.ts";
import { getEnv } from "./utils/os.ts";
import { handleDeleteProjectRequest } from "./handlers/projects.ts";
import {
  handleGitStatusRequest,
  handleGitDiffRequest,
  handleGitFileRequest,
} from "./handlers/git.ts";
import {
  handleVSCodeStartRequest,
  handleVSCodeStopRequest,
  handleVSCodeStatusRequest,
  getVSCodePort,
  stopVSCodeServer,
  createVSCodeUpgradeHandler,
} from "./handlers/vscode.ts";

export interface AppConfig {
  debugMode: boolean;
  staticPath: string;
  cliPath: string; // Actual CLI script path detected by validateQwenCli
  serializeChatRequests?: boolean;
  tokenSecret?: string; // Secret for Open-ACE integration token validation
  quotaCheckEnabled?: boolean; // Enable quota checking with Open-ACE
  openaceApiUrl?: string; // Open-ACE API URL for quota checking
  authType?: string; // Authentication type for Qwen CLI
}

export function createApp(
  runtime: Runtime,
  config: AppConfig,
): {
  app: Hono<ConfigContext>;
  shutdown: () => void;
  vscodeUpgradeHandler: (
    req: import("node:http").IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ) => void;
} {
  const app = new Hono<ConfigContext>();

  // Store AbortControllers for each request (shared with chat handler)
  const requestAbortControllers = new Map<string, AbortController>();

  // Store pending permission requests for canUseTool callback
  const pendingPermissions = new Map<string, PendingPermission>();

  /** Abort all active CLI subprocesses — called on server shutdown */
  const shutdown = () => {
    for (const [, ac] of requestAbortControllers) {
      ac.abort();
    }
    abortAllTrackedCliRequests();
    requestAbortControllers.clear();
    for (const [, pending] of pendingPermissions) {
      pending.resolve({ behavior: "deny", message: "Server shutting down" });
    }
    pendingPermissions.clear();
    stopVSCodeServer();
    // Stop the LLM proxy (fire-and-forget, shutdown is synchronous)
    stopLlmProxy().catch((err) => {
      logger.app.warn("Error stopping LLM proxy during shutdown: {error}", { error: String(err) });
    });
  };

  // Start LLM proxy for Open-ACE integration mode.
  // When OPENAI_BASE_URL is set, CLI subprocesses send LLM requests to that URL.
  // The proxy intercepts these requests, adds X-Session-Id header, and forwards
  // to the real upstream, ensuring proper session attribution.
  // @see https://github.com/ivycomputing/qwen-code-webui/issues/220
  const openaiBaseUrl = getEnv("OPENAI_BASE_URL");
  if (openaiBaseUrl) {
    startLlmProxy(openaiBaseUrl).then((port) => {
      logger.app.info(
        "LLM proxy started on port {port} for session header injection (upstream: {upstream})",
        { port, upstream: openaiBaseUrl },
      );
    }).catch((err) => {
      logger.app.error(
        "Failed to start LLM proxy: {error}. X-Session-Id header will not be injected.",
        { error: String(err) },
      );
    });
  }

  const vscodeUpgradeHandler = createVSCodeUpgradeHandler();

  // CORS middleware
  // allowMethods intentionally omitted to use Hono defaults
  // (GET, HEAD, PUT, POST, DELETE, PATCH, OPTIONS)
  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type"],
    }),
  );

  // Token authentication middleware for Open-ACE integration
  // Only applies to API routes (not static assets or SPA pages)
  // Static assets (JS, CSS) and index.html don't carry token from iframe URL
  // Frontend JS reads token from URL query param and includes in API requests
  app.use("/api/*", createTokenAuthMiddleware(config.tokenSecret));

  // Configuration middleware - makes app settings available to all handlers
  app.use(
    "*",
    createConfigMiddleware({
      debugMode: config.debugMode,
      serializeChatRequests: config.serializeChatRequests,
      runtime,
      cliPath: config.cliPath,
      quotaCheckEnabled: config.quotaCheckEnabled,
      openaceApiUrl: config.openaceApiUrl,
      authType: config.authType,
    }),
  );

  // API routes
  app.get("/api/version", () => handleVersionRequest());
  app.get("/api/models", (c) => handleModelsRequest(c));
  app.get("/api/projects", (c) => handleProjectsRequest(c));
  app.delete("/api/projects/:encodedProjectName", (c) =>
    handleDeleteProjectRequest(c),
  );
  app.get("/api/quota/status", (c) => handleQuotaStatusRequest(c));

  // Git file change tracking APIs
  app.get("/api/git/status", (c) => handleGitStatusRequest(c));
  app.get("/api/git/diff", (c) => handleGitDiffRequest(c));
  app.get("/api/git/file", (c) => handleGitFileRequest(c));

  // VS Code Server APIs
  app.post("/api/vscode/start", (c) => handleVSCodeStartRequest(c));
  app.delete("/api/vscode/stop", (c) => handleVSCodeStopRequest(c));
  app.get("/api/vscode/status", (c) => handleVSCodeStatusRequest(c));

  app.get("/api/projects/:encodedProjectName/histories", (c) =>
    handleHistoriesRequest(c),
  );

  app.get("/api/projects/:encodedProjectName/histories/:sessionId", (c) =>
    handleConversationRequest(c),
  );

  app.post("/api/abort/:requestId", (c) =>
    handleAbortRequest(c, requestAbortControllers),
  );

  app.post("/api/permission/respond", (c) =>
    handlePermissionRespond(c, pendingPermissions),
  );

  app.post("/api/chat", quotaCheckMiddleware, (c) =>
    handleChatRequest(c, requestAbortControllers, pendingPermissions),
  );

  // VS Code reverse proxy — fetch for HTTP, http-proxy for WebSocket (via upgrade handler)
  app.all("/vscode/*", async (c) => {
    const port = getVSCodePort();
    if (!port) {
      return c.json({ error: "VS Code server not running" }, 503);
    }

    const path = c.req.path.replace("/vscode", "");
    const queryString = c.req.url.includes("?") ? c.req.url.split("?")[1] : "";
    const fullUrl = queryString
      ? `http://localhost:${port}${path}?${queryString}`
      : `http://localhost:${port}${path}`;

    try {
      const headers = new Headers();
      c.req.raw.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower !== "host") {
          headers.set(key, value);
        }
      });
      headers.set("host", `localhost:${port}`);
      if (headers.has("origin")) {
        headers.set("origin", `http://localhost:${port}`);
      }

      const method = c.req.method;
      let body: BodyInit | null = null;
      if (method !== "GET" && method !== "HEAD") {
        body = c.req.raw.body;
      }

      const response = await fetch(fullUrl, { method, headers, body });

      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("content-length");
      responseHeaders.delete("transfer-encoding");
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        responseHeaders.delete("X-Frame-Options");
        responseHeaders.delete("Content-Security-Policy");
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (error) {
      logger.app.error("VS Code proxy error: {error}", { error });
      return c.json({ error: "VS Code proxy failed" }, 502);
    }
  });

  // Static file serving with SPA fallback
  // Serve static assets (CSS, JS, images, etc.)
  const serveStatic = runtime.createStaticFileMiddleware({
    root: config.staticPath,
  });
  app.use("/assets/*", serveStatic);

  // SPA fallback - serve index.html for all unmatched routes (except API routes)
  app.get("*", async (c) => {
    const path = c.req.path;

    // Skip API routes
    if (path.startsWith("/api/")) {
      return c.text("Not found", 404);
    }

    try {
      const indexPath = `${config.staticPath}/index.html`;
      const indexFile = await readBinaryFile(indexPath);
      return c.html(new TextDecoder().decode(indexFile));
    } catch (error) {
      logger.app.error("Error serving index.html: {error}", { error });
      return c.text("Internal server error", 500);
    }
  });

  return { app, shutdown, vscodeUpgradeHandler };
}
