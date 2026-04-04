/**
 * CLI argument parsing using runtime abstraction
 *
 * Handles command-line argument parsing in a runtime-agnostic way.
 */

import { program } from "commander";
import { VERSION } from "./version.ts";
import { getEnv, getArgs } from "../utils/os.ts";

export interface ParsedArgs {
  debug: boolean;
  port: number;
  host: string;
  qwenPath?: string;
  tokenSecret?: string;
  quotaCheckEnabled?: boolean;
  openaceApiUrl?: string;
}

export function parseCliArgs(): ParsedArgs {
  // Use version from auto-generated version.ts file
  const version = VERSION;

  // Get default port from environment
  const defaultPort = parseInt(getEnv("PORT") || "8080", 10);

  // Configure program
  program
    .name("qwen-code-webui")
    .version(version, "-v, --version", "display version number")
    .description("Qwen Code Web UI Backend Server")
    .option(
      "-p, --port <port>",
      "Port to listen on",
      (value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          throw new Error(`Invalid port number: ${value}`);
        }
        return parsed;
      },
      defaultPort,
    )
    .option(
      "--host <host>",
      "Host address to bind to (use 0.0.0.0 for all interfaces)",
      "127.0.0.1",
    )
    .option(
      "--qwen-path <path>",
      "Path to qwen executable (overrides automatic detection)",
    )
    .option(
      "--token-secret <secret>",
      "Token secret for Open-ACE integration authentication (optional)",
    )
    .option(
      "--quota-check-enabled",
      "Enable quota checking with Open-ACE",
      false,
    )
    .option(
      "--openace-api-url <url>",
      "Open-ACE API URL for quota checking",
    )
    .option("-d, --debug", "Enable debug mode", false);

  // Parse arguments - Commander.js v14 handles this automatically
  program.parse(getArgs(), { from: "user" });
  const options = program.opts();

  // Handle DEBUG environment variable manually
  const debugEnv = getEnv("DEBUG");
  const debugFromEnv = debugEnv?.toLowerCase() === "true" || debugEnv === "1";

  return {
    debug: options.debug || debugFromEnv,
    port: options.port,
    host: options.host,
    qwenPath: options.qwenPath,
    tokenSecret: options.tokenSecret,
    quotaCheckEnabled: options.quotaCheckEnabled,
    openaceApiUrl: options.openaceApiUrl,
  };
}
