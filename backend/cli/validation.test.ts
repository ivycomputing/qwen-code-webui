/**
 * Tests for CLI validation utilities (version range checks and bundled-CLI fallback)
 *
 * Covers the behaviors introduced for issues #277/#278:
 * - parsing and comparing Qwen CLI version output
 * - warnings when the detected CLI is outside the tested version range
 * - falling back to the SDK-bundled CLI when no `qwen` is found in PATH
 * - `--qwen-path bundled` selecting the SDK-bundled CLI explicitly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Runtime } from "../runtime/types.ts";

vi.mock("../utils/logger.ts", () => ({
  logger: {
    cli: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

vi.mock("../utils/os.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/os.ts")>()),
  exit: vi.fn((code: number) => {
    throw new Error(`EXIT_${code}`);
  }),
}));

import { logger } from "../utils/logger.ts";
import {
  parseCliVersion,
  compareVersions,
  checkCliVersionCompatibility,
  validateQwenCli,
  BUNDLED_CLI_ALIAS,
} from "./validation.ts";

const BUNDLED_PATH = "/fake/node_modules/@qwen-code/sdk/dist/cli/cli.js";

interface MockRuntimeOptions {
  qwenCandidates?: string[];
  bundledPath?: string | null;
  versionOutput?: string;
}

function makeMockRuntime(options: MockRuntimeOptions = {}): Runtime {
  const {
    qwenCandidates = ["/usr/local/bin/qwen"],
    bundledPath = undefined,
    versionOutput = "0.24.0",
  } = options;
  return {
    findExecutable: vi.fn(async (name: string) => {
      if (name === "qwen") return qwenCandidates;
      if (name === "node") return ["/usr/bin/node"];
      return [];
    }),
    runCommand: vi.fn(async (command: string, args: string[]) => {
      // `node <bundled cli.js> --version` used for bundled CLI version probing
      if (args[0] === BUNDLED_PATH && args[1] === "--version") {
        return {
          success: true,
          stdout: `${versionOutput}\n`,
          stderr: "",
          code: 0,
        };
      }
      // `qwen --version` executed by the PATH-wrapping detection
      if (args[0] === "--version") {
        return {
          success: true,
          stdout: `${versionOutput}\n`,
          stderr: "",
          code: 0,
        };
      }
      return { success: true, stdout: "", stderr: "", code: 0 };
    }),
    ...(bundledPath !== undefined
      ? { resolveBundledCliPath: () => bundledPath }
      : {}),
  } as unknown as Runtime;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseCliVersion", () => {
  it("parses a plain semver output", () => {
    expect(parseCliVersion("0.24.0")).toBe("0.24.0");
  });

  it("parses semver embedded in longer output", () => {
    expect(parseCliVersion("Qwen Code 0.17.0\n")).toBe("0.17.0");
  });

  it("strips a leading v and nightly suffix", () => {
    expect(parseCliVersion("v1.2.3")).toBe("1.2.3");
    expect(parseCliVersion("0.24.6-nightly.20260926")).toBe("0.24.6");
  });

  it("returns null for unparseable output", () => {
    expect(parseCliVersion("")).toBeNull();
    expect(parseCliVersion("not a version")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by major, minor and patch", () => {
    expect(compareVersions("0.9.9", "0.17.0")).toBeLessThan(0);
    expect(compareVersions("0.17.0", "0.17.0")).toBe(0);
    expect(compareVersions("0.17.1", "0.17.0")).toBeGreaterThan(0);
    expect(compareVersions("0.24.0", "0.17.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.24.6")).toBeGreaterThan(0);
  });

  it("compares malformed input as equal instead of returning NaN", () => {
    expect(compareVersions("x.y.z", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3", "not-a-version")).toBe(0);
  });
});

describe("checkCliVersionCompatibility", () => {
  it("warns when the CLI version is below the minimum tested version", () => {
    checkCliVersionCompatibility("0.10.4");
    expect(logger.cli.warn).toHaveBeenCalledWith(
      expect.stringContaining("0.17.0"),
    );
  });

  it("stays quiet when the version is inside the tested range", () => {
    checkCliVersionCompatibility("0.24.0");
    expect(logger.cli.warn).not.toHaveBeenCalled();
    expect(logger.cli.error).not.toHaveBeenCalled();
  });

  it("logs an informational note above the highest tested version", () => {
    checkCliVersionCompatibility("0.25.0");
    expect(logger.cli.info).toHaveBeenCalledWith(
      expect.stringContaining("0.24.6"),
    );
    expect(logger.cli.warn).not.toHaveBeenCalled();
  });

  it("warns with the raw output when the version cannot be parsed", () => {
    checkCliVersionCompatibility("qwen: some future output format");
    expect(logger.cli.warn).toHaveBeenCalledWith(
      expect.stringContaining("qwen: some future output format"),
    );
  });

  it("does nothing when there is no version output at all", () => {
    checkCliVersionCompatibility("");
    expect(logger.cli.warn).not.toHaveBeenCalled();
    expect(logger.cli.info).not.toHaveBeenCalled();
  });
});

describe("validateQwenCli fallback behavior", () => {
  it("falls back to the SDK-bundled CLI when PATH search finds nothing", async () => {
    const runtime = makeMockRuntime({
      qwenCandidates: [],
      bundledPath: BUNDLED_PATH,
      versionOutput: "0.24.6",
    });

    const result = await validateQwenCli(runtime);

    expect(result).toBe(BUNDLED_PATH);
    expect(logger.cli.warn).toHaveBeenCalledWith(
      expect.stringContaining("not found in PATH"),
    );
    // Startup summary names the path, version and source of the CLI in use
    expect(logger.cli.info).toHaveBeenCalledWith(
      expect.stringContaining(BUNDLED_PATH),
    );
    expect(logger.cli.info).toHaveBeenCalledWith(
      expect.stringContaining("0.24.6"),
    );
  });

  it("exits when PATH is empty and the runtime cannot resolve a bundled CLI", async () => {
    const runtime = makeMockRuntime({ qwenCandidates: [], bundledPath: null });

    await expect(validateQwenCli(runtime)).rejects.toThrow("EXIT_1");
    expect(logger.cli.error).toHaveBeenCalledWith(
      expect.stringContaining("npm install -g"),
    );
  });

  it(`treats --qwen-path=${BUNDLED_CLI_ALIAS} as the SDK-bundled CLI`, async () => {
    const runtime = makeMockRuntime({
      bundledPath: BUNDLED_PATH,
      versionOutput: "0.24.6",
    });

    const result = await validateQwenCli(runtime, BUNDLED_CLI_ALIAS);

    expect(result).toBe(BUNDLED_PATH);
    expect(logger.cli.error).not.toHaveBeenCalled();
    expect(logger.cli.info).toHaveBeenCalledWith(
      expect.stringContaining("bundled"),
    );
  });

  it(`exits when --qwen-path=${BUNDLED_CLI_ALIAS} is requested but unavailable`, async () => {
    const runtime = makeMockRuntime({ bundledPath: null });

    await expect(validateQwenCli(runtime, BUNDLED_CLI_ALIAS)).rejects.toThrow(
      "EXIT_1",
    );
    expect(logger.cli.error).toHaveBeenCalledWith(
      expect.stringContaining("bundled"),
    );
  });
});

describe("validateQwenCli host CLI version checks", () => {
  it("warns when the detected host CLI is below the minimum tested version", async () => {
    const runtime = makeMockRuntime({ versionOutput: "0.10.4" });

    const result = await validateQwenCli(runtime);

    expect(result).toBe("/usr/local/bin/qwen");
    expect(logger.cli.warn).toHaveBeenCalledWith(
      expect.stringContaining("0.17.0"),
    );
    expect(logger.cli.info).toHaveBeenCalledWith(
      expect.stringContaining("0.10.4"),
    );
  });

  it("accepts a version inside the tested range without warnings", async () => {
    const runtime = makeMockRuntime({ versionOutput: "0.24.0" });

    const result = await validateQwenCli(runtime);

    expect(result).toBe("/usr/local/bin/qwen");
    expect(logger.cli.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("minimum"),
    );
  });
});
