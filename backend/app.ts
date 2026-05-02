/**
 * Runtime-agnostic Hono application
 *
 * This module creates the Hono application with all routes and middleware,
 * but doesn't include runtime-specific code like CLI parsing or server startup.
 */

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
import { handlePermissionRespond, type PendingPermission } from "./handlers/permission.ts";
import { handleVersionRequest } from "./handlers/version.ts";
import { handleModelsRequest } from "./handlers/models.ts";
import { handleQuotaStatusRequest, quotaCheckMiddleware } from "./handlers/quota.ts";
import { logger } from "./utils/logger.ts";
import { readBinaryFile } from "./utils/fs.ts";
import { handleDeleteProjectRequest } from "./handlers/projects.ts";

export interface AppConfig {
  debugMode: boolean;
  staticPath: string;
  cliPath: string; // Actual CLI script path detected by validateQwenCli
  tokenSecret?: string; // Secret for Open-ACE integration token validation
  quotaCheckEnabled?: boolean; // Enable quota checking with Open-ACE
  openaceApiUrl?: string; // Open-ACE API URL for quota checking
  authType?: string; // Authentication type for Qwen CLI
}

export function createApp(
  runtime: Runtime,
  config: AppConfig,
): Hono<ConfigContext> {
  const app = new Hono<ConfigContext>();

  // Store AbortControllers for each request (shared with chat handler)
  const requestAbortControllers = new Map<string, AbortController>();

  // Store pending permission requests for canUseTool callback
  const pendingPermissions = new Map<string, PendingPermission>();

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
  app.delete("/api/projects/:encodedProjectName", (c) => handleDeleteProjectRequest(c));
  app.get("/api/quota/status", (c) => handleQuotaStatusRequest(c));

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
    handleChatRequest(c, requestAbortControllers, pendingPermissions));

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

  return app;
}
