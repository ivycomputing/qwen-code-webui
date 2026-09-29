/**
 * Shared CLI validation utilities
 *
 * Common validation functions used across different runtime CLI entry points.
 */

import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import process from "node:process";
import type { Runtime } from "../runtime/types.ts";
import { logger } from "../utils/logger.ts";
import {
  readTextFile,
  writeTextFile,
  exists,
  withTempDir,
} from "../utils/fs.ts";
import { getPlatform, getEnv, exit } from "../utils/os.ts";

// Regex to fix double backslashes that might occur during Windows path string processing
const DOUBLE_BACKSLASH_REGEX = /\\\\/g;

/**
 * Minimum Qwen CLI version this WebUI is tested against (issue #278).
 * Features like the model-proxy delegation flow (#274) rely on recent CLI
 * behavior and may silently misbehave below this version.
 */
export const MIN_TESTED_CLI_VERSION = "0.17.0";

/**
 * Highest Qwen CLI version this WebUI has been tested against (issue #278).
 * Newer versions are expected to work but are flagged as unverified in logs.
 */
export const MAX_TESTED_CLI_VERSION = "0.24.6";

/**
 * Special --qwen-path value that selects the Qwen CLI bundled inside
 * node_modules/@qwen-code/sdk instead of a host-installed `qwen`.
 */
export const BUNDLED_CLI_ALIAS = "bundled";

const SEMVER_REGEX = /v?(\d+)\.(\d+)\.(\d+)/;

/**
 * Extracts the first semver triple from `qwen --version` output.
 * Assumes the CLI's own version is the first semver in the output, which
 * holds for every released CLI (they print a bare "major.minor.patch").
 * @param versionOutput - Raw stdout of `qwen --version`
 * @returns The parsed version string ("major.minor.patch") or null
 */
export function parseCliVersion(versionOutput: string): string | null {
  const match = versionOutput.trim().match(SEMVER_REGEX);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

/**
 * Compares two semver strings numerically.
 * @returns Negative when a < b, 0 when equal, positive when a > b; malformed
 *   input (anything parseCliVersion would reject) compares as equal (0)
 */
export function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
  const [bMajor, bMinor, bPatch] = b.split(".").map(Number);
  if ([aMajor, aMinor, aPatch, bMajor, bMinor, bPatch].some(Number.isNaN)) {
    return 0;
  }
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/**
 * Logs a warning/note when the detected CLI version falls outside the tested
 * range (issue #278). Never blocks startup; the goal is that version-related
 * misbehavior is diagnosable from the logs.
 * @param versionOutput - Raw stdout of the CLI's `--version` run
 */
export function checkCliVersionCompatibility(versionOutput: string): void {
  if (!versionOutput.trim()) return;

  const version = parseCliVersion(versionOutput);
  if (!version) {
    logger.cli.warn(
      `⚠️  Could not parse Qwen CLI version from output: "${versionOutput.trim()}"`,
    );
    return;
  }

  if (compareVersions(version, MIN_TESTED_CLI_VERSION) < 0) {
    logger.cli.warn(
      `⚠️  Qwen CLI ${version} is older than the minimum tested version ${MIN_TESTED_CLI_VERSION}.`,
    );
    logger.cli.warn(
      "   Some features (e.g. model-proxy delegation) may silently misbehave.",
    );
    logger.cli.warn("   Please update: npm install -g @qwen-code/qwen-code");
    return;
  }

  if (compareVersions(version, MAX_TESTED_CLI_VERSION) > 0) {
    logger.cli.info(
      `ℹ️  Qwen CLI ${version} is newer than the highest tested version ${MAX_TESTED_CLI_VERSION}; not verified with this release.`,
    );
  }
}

/**
 * Runs `<node> <cli.js> --version` for a Node-bundle CLI script and returns
 * its raw version output (empty string when probing fails).
 */
async function runJsCliVersion(
  runtime: Runtime,
  scriptPath: string,
): Promise<string> {
  try {
    // Prefer the running process's node (what the SDK itself uses to spawn
    // .js executables); fall back to a PATH lookup when unavailable.
    const nodePath =
      process.execPath || (await runtime.findExecutable("node"))[0] || "";
    if (!nodePath) return "";
    const result = await runtime.runCommand(
      nodePath,
      [scriptPath, "--version"],
      // Bound the probe so a wedged CLI cannot hang startup
      { timeoutMs: 15_000 },
    );
    if (!result.success) {
      // warn, not debug: the startup summary will say "version unknown" and
      // this is the only line explaining why, so keep it visible by default
      logger.cli.warn(
        `⚠️  Bundled CLI version probe failed (exit ${result.code}): ${result.stderr.trim()}`,
      );
      return "";
    }
    return result.stdout.trim();
  } catch (error) {
    logger.cli.warn(
      `⚠️  Bundled CLI version probe failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return "";
  }
}

/**
 * Parses Windows .cmd script to extract the actual CLI script path
 * Handles NPM cmd-shim execution line pattern: "%_prog%" args "%dp0%\script.js" %*
 * Skips IF EXIST conditions and targets the actual execution line
 * @param runtime - Runtime abstraction for system operations
 * @param cmdPath - Path to the .cmd file to parse
 * @returns Promise<string | null> - The extracted CLI script path or null if parsing fails
 */
async function parseCmdScript(cmdPath: string): Promise<string | null> {
  try {
    logger.cli.debug(`Parsing Windows .cmd script: ${cmdPath}`);
    const cmdContent = await readTextFile(cmdPath);

    // Extract directory of the .cmd file for resolving relative paths
    const cmdDir = dirname(cmdPath);

    // Match NPM cmd-shim execution line pattern: "%_prog%" args "%dp0%\script.js" %*
    // Skip IF EXIST conditions and target the actual execution line
    const execLineMatch = cmdContent.match(/"%_prog%"[^"]*"(%dp0%\\[^"]+)"/);
    if (execLineMatch) {
      const fullPath = execLineMatch[1]; // "%dp0%\path\to\script.js"
      // Extract the relative path part after %dp0%\
      const pathMatch = fullPath.match(/%dp0%\\(.+)/);
      if (pathMatch) {
        const relativePath = pathMatch[1];
        const absolutePath = join(cmdDir, relativePath);

        logger.cli.debug(`Found CLI script reference: ${relativePath}`);
        logger.cli.debug(`Resolved absolute path: ${absolutePath}`);

        // Verify the resolved path exists
        if (await exists(absolutePath)) {
          logger.cli.debug(`.cmd parsing successful: ${absolutePath}`);
          return absolutePath;
        } else {
          logger.cli.debug(`Resolved path does not exist: ${absolutePath}`);
        }
      } else {
        logger.cli.debug(`Could not extract relative path from: ${fullPath}`);
      }
    } else {
      logger.cli.debug(`No CLI script execution pattern found in .cmd content`);
    }

    return null;
  } catch (error) {
    logger.cli.debug(
      `Failed to parse .cmd script: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Generates Windows batch wrapper script
 * @param traceFile - Path to trace output file
 * @param nodePath - Path to original node executable
 * @returns Windows batch script content
 */
function getWindowsWrapperScript(traceFile: string, nodePath: string): string {
  return `@echo off\necho %~1 >> "${traceFile}"\n"${nodePath}" %*`;
}

/**
 * Generates Unix shell wrapper script
 * @param traceFile - Path to trace output file
 * @param nodePath - Path to original node executable
 * @returns Unix shell script content
 */
function getUnixWrapperScript(traceFile: string, nodePath: string): string {
  return `#!/bin/bash\necho "$1" >> "${traceFile}"\nexec "${nodePath}" "$@"`;
}

/**
 * Detects the actual Qwen script path by tracing node execution
 * Uses a temporary node wrapper to capture the actual script path being executed by Qwen CLI
 * @param runtime - Runtime abstraction for system operations
 * @param qwenPath - Path to the qwen executable
 * @returns Promise<{scriptPath: string, versionOutput: string}> - The actual Qwen script path and version output, or empty strings if detection fails
 */
export async function detectQwenCliPath(
  runtime: Runtime,
  qwenPath: string,
): Promise<{ scriptPath: string; versionOutput: string }> {
  const platform = getPlatform();
  const isWindows = platform === "windows";

  // First try PATH wrapping method
  let pathWrappingResult: { scriptPath: string; versionOutput: string } | null =
    null;

  try {
    pathWrappingResult = await withTempDir(async (tempDir: string) => {
      const traceFile = `${tempDir}/trace.log`;

      // Find the original node executable
      const nodeExecutables = await runtime.findExecutable("node");
      if (nodeExecutables.length === 0) {
        // Silently return null - this is not a critical error
        return null;
      }

      const originalNodePath = nodeExecutables[0];

      // Create platform-specific wrapper script
      const wrapperFileName = isWindows ? "node.bat" : "node";
      const wrapperScript = isWindows
        ? getWindowsWrapperScript(traceFile, originalNodePath)
        : getUnixWrapperScript(traceFile, originalNodePath);

      await writeTextFile(
        `${tempDir}/${wrapperFileName}`,
        wrapperScript,
        isWindows ? undefined : { mode: 0o755 },
      );

      // Execute qwen with modified PATH to intercept node calls
      const currentPath = getEnv("PATH") || "";
      const modifiedPath = isWindows
        ? `${tempDir};${currentPath}`
        : `${tempDir}:${currentPath}`;

      const executionResult = await runtime.runCommand(
        qwenPath,
        ["--version"],
        {
          env: { PATH: modifiedPath },
          // Bound the probe so a wedged host CLI cannot hang startup
          timeoutMs: 15_000,
        },
      );

      // Verify command executed successfully
      if (!executionResult.success) {
        return null;
      }

      const versionOutput = executionResult.stdout.trim();

      // Parse trace file to extract script path
      let traceContent: string;
      try {
        traceContent = await readTextFile(traceFile);
      } catch {
        // Trace file might not exist or be readable
        return { scriptPath: "", versionOutput };
      }

      if (!traceContent.trim()) {
        // Empty trace file indicates no node execution was captured
        return { scriptPath: "", versionOutput };
      }

      const traceLines = traceContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Find the Qwen script path from traced node executions
      for (const traceLine of traceLines) {
        let scriptPath = traceLine.trim();

        // Clean up the script path
        if (scriptPath) {
          // Fix double backslashes that might occur during string processing
          if (isWindows) {
            scriptPath = scriptPath.replace(DOUBLE_BACKSLASH_REGEX, "\\");
          }
        }

        if (scriptPath) {
          return { scriptPath, versionOutput };
        }
      }

      // No Qwen script path found in trace
      return { scriptPath: "", versionOutput };
    });
  } catch (error) {
    // Log error for debugging but don't crash the application
    logger.cli.debug(
      `PATH wrapping detection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    pathWrappingResult = null;
  }

  // If PATH wrapping succeeded, return the result
  if (pathWrappingResult && pathWrappingResult.scriptPath) {
    return pathWrappingResult;
  }

  // Try Windows .cmd parsing fallback if PATH wrapping didn't work
  if (isWindows && qwenPath.endsWith(".cmd")) {
    logger.cli.debug(
      "PATH wrapping method failed, trying .cmd parsing fallback...",
    );
    try {
      const cmdParsedPath = await parseCmdScript(qwenPath);
      if (cmdParsedPath) {
        // Get version output, use from PATH wrapping if available
        let versionOutput = pathWrappingResult?.versionOutput || "";
        if (!versionOutput) {
          try {
            const versionResult = await runtime.runCommand(
              qwenPath,
              ["--version"],
              { timeoutMs: 15_000 },
            );
            if (versionResult.success) {
              versionOutput = versionResult.stdout.trim();
            }
          } catch {
            // Ignore version detection errors
          }
        }
        return { scriptPath: cmdParsedPath, versionOutput };
      }
    } catch (fallbackError) {
      logger.cli.debug(
        `.cmd parsing fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      );
    }
  }

  // Both methods failed, return empty result but preserve version output if available
  return {
    scriptPath: "",
    versionOutput: pathWrappingResult?.versionOutput || "",
  };
}

/**
 * Validates that the Qwen CLI is available and detects the actual CLI script path
 * Uses detectQwenCliPath for universal path detection regardless of installation method
 *
 * Resolution order:
 * 1. `--qwen-path bundled` → the CLI bundled with @qwen-code/sdk
 * 2. `--qwen-path <path>` → the given executable
 * 3. `qwen` found in PATH → that installation (preferred: matches the CLI the
 *    user runs in their terminal, including credentials and settings)
 * 4. nothing in PATH → fallback to the SDK-bundled CLI when the runtime can
 *    resolve it (Node only), otherwise exit
 *
 * Also checks the resolved CLI version against the tested range (issue #278)
 * and logs a startup summary naming the CLI actually in use.
 *
 * @param runtime - Runtime abstraction for system operations
 * @param customPath - Optional custom path to qwen executable, or "bundled"
 * @returns Promise<string> - The detected actual CLI script path or validated qwen path
 */
export async function validateQwenCli(
  runtime: Runtime,
  customPath?: string,
): Promise<string> {
  try {
    // --qwen-path bundled: use the CLI shipped inside @qwen-code/sdk
    if (customPath === BUNDLED_CLI_ALIAS) {
      const bundled = runtime.resolveBundledCliPath?.() ?? null;
      if (!bundled) {
        logger.cli.error(
          `❌ --qwen-path ${BUNDLED_CLI_ALIAS} requested, but no CLI is bundled with @qwen-code/sdk in this installation.`,
        );
        logger.cli.error(
          "   (Deno single-binary builds do not support the bundled CLI; install the CLI and drop the option.)",
        );
        exit(1);
      }
      logger.cli.info(`🔍 Using SDK-bundled Qwen CLI: ${bundled}`);
      const versionOutput = await runJsCliVersion(runtime, bundled);
      checkCliVersionCompatibility(versionOutput);
      logCliStartupSummary(bundled, versionOutput, "bundled");
      return bundled;
    }

    // Get platform information once at the beginning
    const platform = getPlatform();
    const isWindows = platform === "windows";

    let qwenPath = "";

    if (customPath) {
      // Use custom path if provided
      qwenPath = customPath;
      logger.cli.info(`🔍 Validating custom Qwen path: ${customPath}`);
    } else {
      // Auto-detect using runtime's findExecutable method
      logger.cli.info("🔍 Searching for Qwen CLI in PATH...");
      const candidates = await runtime.findExecutable("qwen");

      if (candidates.length === 0) {
        // No host CLI: fall back to the SDK-bundled CLI when available (#278
        // discussion) so first-time users can start without a global install.
        const bundled = runtime.resolveBundledCliPath?.() ?? null;
        if (bundled) {
          logger.cli.warn(
            "⚠️  Qwen CLI not found in PATH — falling back to the CLI bundled with @qwen-code/sdk.",
          );
          logger.cli.warn(
            "   Install your own CLI for version control: npm install -g @qwen-code/qwen-code",
          );
          const versionOutput = await runJsCliVersion(runtime, bundled);
          checkCliVersionCompatibility(versionOutput);
          logCliStartupSummary(bundled, versionOutput, "bundled-fallback");
          return bundled;
        }

        logger.cli.error("❌ Qwen CLI not found in PATH");
        logger.cli.error("   Please install qwen-code globally:");
        logger.cli.error("   npm install -g @qwen-code/qwen-code");
        logger.cli.error(
          "   Or visit: https://github.com/QwenLM/qwen-code for installation instructions",
        );
        exit(1);
      }

      // On Windows, prefer .cmd files when multiple candidates exist
      if (isWindows && candidates.length > 1) {
        const cmdCandidate = candidates.find((path) => path.endsWith(".cmd"));
        qwenPath = cmdCandidate || candidates[0];
        logger.cli.debug(`Found Qwen CLI candidates: ${candidates.join(", ")}`);
        logger.cli.debug(
          `Using Qwen CLI path: ${qwenPath} (Windows .cmd preferred)`,
        );
      } else {
        // Use the first candidate (most likely to be the correct one)
        qwenPath = candidates[0];
        logger.cli.debug(`Found Qwen CLI candidates: ${candidates.join(", ")}`);
        logger.cli.debug(`Using Qwen CLI path: ${qwenPath}`);
      }
    }

    // Check if this is a Windows .cmd file for enhanced debugging
    const isCmdFile = qwenPath.endsWith(".cmd");

    if (isWindows && isCmdFile) {
      logger.cli.debug(
        "Detected Windows .cmd file - fallback parsing available if needed",
      );
    }

    // Detect the actual CLI script path using tracing approach
    logger.cli.info("🔍 Detecting actual Qwen CLI script path...");
    const detection = await detectQwenCliPath(runtime, qwenPath);

    if (detection.scriptPath) {
      // Resolve symlinks so SDK detects the .js extension and uses `node` to execute
      let resolvedPath = detection.scriptPath;
      try {
        const realPath = realpathSync(detection.scriptPath);
        if (realPath !== detection.scriptPath) {
          logger.cli.info(
            `Resolved symlink: ${detection.scriptPath} -> ${realPath}`,
          );
          resolvedPath = realPath;
        }
      } catch {
        // If realpath fails, continue with the original path
      }
      logger.cli.info(`✅ Qwen CLI script detected: ${resolvedPath}`);
      checkCliVersionCompatibility(detection.versionOutput);
      logCliStartupSummary(
        resolvedPath,
        detection.versionOutput,
        customPath ? "custom" : "PATH",
      );
      return resolvedPath;
    } else {
      // Show warning but continue with fallback when detection fails
      logger.cli.warn("⚠️  Qwen CLI script path detection failed");
      logger.cli.warn("   Falling back to using the qwen executable directly.");
      logger.cli.warn("   This may not work properly, but continuing anyway.");
      logger.cli.warn("");
      logger.cli.warn(`   Using fallback path: ${qwenPath}`);
      checkCliVersionCompatibility(detection.versionOutput);
      logCliStartupSummary(
        qwenPath,
        detection.versionOutput,
        customPath ? "custom" : "PATH",
      );
      return qwenPath;
    }
  } catch (error) {
    logger.cli.error("❌ Failed to validate Qwen CLI");
    logger.cli.error(
      `   Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    exit(1);
  }
}

/**
 * Logs the single startup line naming the CLI actually in use, so
 * version-related issues are diagnosable from logs alone (issue #278).
 */
function logCliStartupSummary(
  cliPath: string,
  versionOutput: string,
  source: "PATH" | "custom" | "bundled" | "bundled-fallback",
): void {
  const version = parseCliVersion(versionOutput);
  logger.cli.info(
    `✅ Using Qwen CLI: ${cliPath} (${version ? `version ${version}, ` : "version unknown, "}source: ${source})`,
  );
}
