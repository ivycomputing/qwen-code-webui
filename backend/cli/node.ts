#!/usr/bin/env node
/**
 * Node.js-specific entry point
 *
 * This module handles Node.js-specific initialization including CLI argument parsing,
 * Qwen CLI validation, and server startup using the NodeRuntime.
 */

import { readTokenSecret } from "./tokenSecret.ts";
import { createApp } from "../app.ts";
import { validateModelProxyConfig } from "../utils/modelProxyEnvironment.ts";
import { NodeRuntime } from "../runtime/node.ts";
import { parseCliArgs } from "./args.ts";
import { validateQwenCli } from "./validation.ts";
import { setupLogger, logger } from "../utils/logger.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { exit } from "../utils/os.ts";

async function main(runtime: NodeRuntime) {
  // Parse CLI arguments
  const args = parseCliArgs();

  const tokenSecret = readTokenSecret(args.tokenSecret, args.tokenSecretFile);

  // Initialize logging system
  await setupLogger(args.debug);

  if (args.debug) {
    logger.cli.info("🐛 Debug mode enabled");
  }

  // Validate Qwen CLI availability and get the detected CLI path
  const cliPath = await validateQwenCli(runtime, args.qwenPath);

  // Use absolute path for static files (supported in @hono/node-server v1.17.0+)
  // Node.js 20.11.0+ compatible with fallback for older versions
  const __dirname =
    import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

  // In development (tsx), __dirname is backend/cli, so static files are at ../dist/static
  // In production (bundled), __dirname is dist/cli, so static files are at ../static
  // Check if we're running from bundled dist directory
  const isBundled = __dirname.includes("/dist/cli");
  const staticPath = isBundled
    ? join(__dirname, "../static")
    : join(__dirname, "../dist/static");

  if (args.debug) {
    logger.cli.debug(`Static path: ${staticPath}`);
  }

  try {
    validateModelProxyConfig(
      {
        modelProxyBaseUrl: args.modelProxyBaseUrl,
        tokenSecret,
        authType: args.authType,
        openaceApiUrl: args.openaceApiUrl,
      },
      process.env.OPENACE_API_URL,
    );
  } catch (error) {
    console.error(`Delegated model proxy configuration invalid: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Create application
  const { app, shutdown, vscodeUpgradeHandler } = createApp(runtime, {
    debugMode: args.debug,
    staticPath,
    cliPath,
    tokenSecret,
    serializeChatRequests: args.serializeChatRequests,
    modelProxyBaseUrl: args.modelProxyBaseUrl,
    quotaCheckEnabled: args.quotaCheckEnabled,
    openaceApiUrl: args.openaceApiUrl,
    authType: args.authType,
  });

  // Graceful shutdown: kill CLI subprocesses on SIGTERM/SIGINT
  const handleSignal = () => {
    shutdown();
    // Give CLI subprocesses time to die after receiving SIGTERM via ac.abort()
    setTimeout(() => process.exit(0), 3000);
  };
  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);

  // Start server (only show this message when everything is ready)
  logger.cli.info(`🚀 Server starting on ${args.host}:${args.port}`);

  // Register VS Code WebSocket upgrade handler before starting server
  runtime.onUpgrade(vscodeUpgradeHandler);

  await runtime.serve(args.port, args.host, app.fetch);
}

// Run the application
const runtime = new NodeRuntime();
main(runtime).catch((error) => {
  // Logger may not be initialized yet, so use console.error
  console.error("Failed to start server:", error);
  exit(1);
});
