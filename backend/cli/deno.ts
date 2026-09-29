/**
 * Deno-specific entry point
 *
 * This module handles Deno-specific initialization including CLI argument parsing,
 * Qwen CLI validation, and server startup using the DenoRuntime.
 */

import { createApp } from "../app.ts";
import { validateModelProxyConfig } from "../utils/modelProxyEnvironment.ts";
import { DenoRuntime, relayWebSocket } from "../runtime/deno.ts";
import { resolveCurrentVSCodeWsTarget } from "../handlers/vscode.ts";
import { parseCliArgs } from "./args.ts";
import { validateQwenCli } from "./validation.ts";
import { logger, setupLogger } from "../utils/logger.ts";
import { dirname, fromFileUrl, join } from "@std/path";
import { exit } from "../utils/os.ts";
import { readTokenSecret } from "./tokenSecret.ts";

async function main(runtime: DenoRuntime) {
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

  // Static files live at <module dir>/../dist/static both in development
  // (backend/) and inside deno compile binaries, where --include ./dist/static
  // preserves the source tree layout.
  const __dirname = dirname(fromFileUrl(import.meta.url));
  const staticPath = join(__dirname, "../dist/static");

  try {
    validateModelProxyConfig(
      {
        modelProxyBaseUrl: args.modelProxyBaseUrl,
        tokenSecret,
        authType: args.authType,
        openaceApiUrl: args.openaceApiUrl,
      },
      Deno.env.get("OPENACE_API_URL"),
    );
  } catch (error) {
    console.error(
      `Delegated model proxy configuration invalid: ${
        error instanceof Error ? error.message : error
      }`,
    );
    exit(1);
  }

  // Create application
  const { app, shutdown } = createApp(runtime, {
    debugMode: args.debug,
    staticPath,
    cliPath: cliPath,
    tokenSecret,
    authType: args.authType,
    serializeChatRequests: args.serializeChatRequests,
    modelProxyBaseUrl: args.modelProxyBaseUrl,
    quotaCheckEnabled: args.quotaCheckEnabled,
    openaceApiUrl: args.openaceApiUrl,
  });

  // Wire the VS Code WebSocket proxy: upgrade requests under /vscode are
  // intercepted inside Deno.serve and relayed to the local code-server
  // (parity with cli/node.ts registering the http-proxy upgrade handler).
  runtime.onUpgrade((req) => relayWebSocket(req, resolveCurrentVSCodeWsTarget));

  // Graceful shutdown: kill CLI subprocesses on SIGTERM/SIGINT.
  // Windows Deno only supports SIGINT/SIGBREAK listeners — registering
  // SIGTERM there throws, so gate it by platform.
  const handleSignal = () => {
    shutdown();
    // Give CLI subprocesses time to die after receiving SIGTERM via ac.abort()
    setTimeout(() => exit(0), 3000);
  };
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM", handleSignal);
  }
  Deno.addSignalListener("SIGINT", handleSignal);

  // Start server (only show this message when everything is ready)
  logger.cli.info(`🚀 Server starting on ${args.host}:${args.port}`);

  await runtime.serve(args.port, args.host, app.fetch);
}

// Run the application
if (import.meta.main) {
  const runtime = new DenoRuntime();
  main(runtime).catch((error) => {
    // Logger may not be initialized yet, so use console.error
    console.error("Failed to start server:", error);
    exit(1);
  });
}
