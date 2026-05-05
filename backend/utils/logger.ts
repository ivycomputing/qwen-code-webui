/**
 * Unified logging system using LogTape
 *
 * Provides centralized logging configuration with debugMode support.
 * Works across both Deno and Node.js environments with unified import syntax.
 *
 * Logs are written to both console and a log file for diagnostics.
 */

import {
  configure,
  getConsoleSink,
  getStreamSink,
  getLogger,
  LogLevel,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import { getTextFormatter } from "@logtape/logtape";
import { mkdirSync, createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import stream from "node:stream";

let isConfigured = false;

/**
 * Resolve the log file directory.
 * Priority: OPENACE_LOG_DIR env > ~/.open-ace/logs/ (if ~/.open-ace exists) > ./logs/
 */
function resolveLogDir(): string {
  const envDir = process.env["OPENACE_LOG_DIR"];
  if (envDir) return envDir;

  const openaceDir = join(homedir(), ".open-ace");
  if (existsSync(openaceDir)) {
    return join(openaceDir, "logs");
  }

  return join(process.cwd(), "logs");
}

/**
 * Initialize the logging system
 * @param debugMode - Whether to enable debug level logging
 */
export async function setupLogger(debugMode: boolean): Promise<void> {
  if (isConfigured) {
    return; // Avoid double configuration
  }

  const lowestLevel: LogLevel = debugMode ? "debug" : "info";

  // Set up file logging
  const logDir = resolveLogDir();
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, "webui.log");
  const fileStream = createWriteStream(logFile, { flags: "a" });
  const webStream = stream.Writable.toWeb(fileStream);

  const fileSink = getStreamSink(webStream, {
    formatter: getTextFormatter({
      timestamp: "time",
    }),
    nonBlocking: true,
  });

  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: getPrettyFormatter({
          icons: false,
          align: false,
          inspectOptions: {
            depth: Infinity,
            colors: true,
            compact: false,
          },
        }),
      }),
      file: fileSink,
    },
    loggers: [
      {
        category: [],
        lowestLevel,
        sinks: ["console", "file"],
      },
      // Suppress LogTape meta logger info messages
      {
        category: ["logtape", "meta"],
        lowestLevel: "warning",
        sinks: ["console", "file"],
      },
    ],
  });

  isConfigured = true;
  // Use console directly since logger might not be ready for this message
  console.log(`[Logger] Log file: ${logFile}`);
}

/**
 * Centralized loggers for different categories
 */
export const logger = {
  // CLI and startup logging
  cli: getLogger(["cli"]),

  // Chat handling and streaming
  chat: getLogger(["chat"]),

  // History and conversation management
  history: getLogger(["history"]),

  // API handlers
  api: getLogger(["api"]),

  // Model management
  models: getLogger(["models"]),

  // General application logging
  app: getLogger(["app"]),
};

/**
 * Check if logging system is configured
 */
export function isLoggerConfigured(): boolean {
  return isConfigured;
}
