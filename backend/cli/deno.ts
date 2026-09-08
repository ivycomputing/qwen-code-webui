/**
 * Deno-specific entry point
 *
 * This module handles Deno-specific initialization including CLI argument parsing,
 * Qwen CLI validation, and server startup using the DenoRuntime.
 */

import { createApp } from "../app.ts";
import { DenoRuntime } from "../runtime/deno.ts";
import { parseCliArgs } from "./args.ts";
import { validateQwenCli } from "./validation.ts";
import { logger, setupLogger } from "../utils/logger.ts";
import { startLlmProxy } from "../utils/llmProxy.ts";
import { dirname, fromFileUrl, join } from "@std/path";
import { exit, getEnv } from "../utils/os.ts";

async function main(runtime: DenoRuntime) {
  // Parse CLI arguments
  const args = parseCliArgs();

  // Initialize logging system
  await setupLogger(args.debug);

  if (args.debug) {
    logger.cli.info("🐛 Debug mode enabled");
  }

  // Validate Qwen CLI availability and get the detected CLI path
  const cliPath = await validateQwenCli(runtime, args.qwenPath);

  // Start LLM proxy for Open-ACE integration mode BEFORE the server begins
  // accepting requests. Awaiting it here guarantees the proxy is listening
  // before any chat request can arrive.
  // @see https://github.com/ivycomputing/qwen-code-webui/issues/267
  const openaiBaseUrl = getEnv("OPENAI_BASE_URL");
  if (openaiBaseUrl) {
    try {
      const port = await startLlmProxy(openaiBaseUrl);
      logger.cli.info(
        `LLM proxy ready on port ${port} for session header injection (upstream: ${openaiBaseUrl})`,
      );
    } catch (err) {
      logger.cli.error(`Failed to start LLM proxy: ${err}`);
      exit(1);
    }
  }

  // Create application
  const __dirname = dirname(fromFileUrl(import.meta.url));
  const staticPath = join(__dirname, "../dist");

  const app = createApp(runtime, {
    debugMode: args.debug,
    staticPath,
    cliPath: cliPath,
    quotaCheckEnabled: args.quotaCheckEnabled,
    openaceApiUrl: args.openaceApiUrl,
  });

  // Start server (only show this message when everything is ready)
  logger.cli.info(`🚀 Server starting on ${args.host}:${args.port}`);
  runtime.serve(args.port, args.host, app.fetch);
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
