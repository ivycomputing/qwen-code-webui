/**
 * Guards the machine-readable CLI-compatibility metadata in backend/package.json.
 *
 * Downstream consumers (e.g. open-ace's upgrade automation) read the
 * `qwenCode` object via `npm view qwen-code-webui qwenCode` to derive the
 * host CLI version pair that this WebUI release was tested against. These
 * tests keep that metadata in sync with the actual constants the runtime
 * enforces and with the CLI actually bundled in the installed SDK, so a
 * version bump cannot ship without updating all of them.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";
import {
  MIN_TESTED_CLI_VERSION,
  MAX_TESTED_CLI_VERSION,
  compareVersions,
} from "./validation.ts";

interface QwenCodeMetadata {
  testedCliMin: string;
  testedCliMax: string;
  recommendedCli: string;
}

const pkg = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    "utf8",
  ),
) as { qwenCode?: QwenCodeMetadata };

describe("package.json qwenCode metadata", () => {
  it("exists with all fields", () => {
    expect(pkg.qwenCode).toBeDefined();
    expect(pkg.qwenCode?.testedCliMin).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.qwenCode?.testedCliMax).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.qwenCode?.recommendedCli).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches the runtime-enforced version range in validation.ts", () => {
    expect(pkg.qwenCode?.testedCliMin).toBe(MIN_TESTED_CLI_VERSION);
    expect(pkg.qwenCode?.testedCliMax).toBe(MAX_TESTED_CLI_VERSION);
  });

  it("recommends a CLI inside the tested range", () => {
    expect(
      compareVersions(pkg.qwenCode!.recommendedCli, MIN_TESTED_CLI_VERSION),
    ).toBeGreaterThanOrEqual(0);
    expect(
      compareVersions(pkg.qwenCode!.recommendedCli, MAX_TESTED_CLI_VERSION),
    ).toBeLessThanOrEqual(0);
  });

  it("recommends exactly the CLI bundled inside the installed SDK", () => {
    // The bundled CLI is what --qwen-path bundled and the PATH-missing
    // fallback actually run, so the recommendation must track it. Probing
    // the installed artifact (rather than a second hand-maintained constant)
    // is what closes the drift class.
    const bundledCli = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "node_modules",
      "@qwen-code",
      "sdk",
      "dist",
      "cli",
      "cli.js",
    );
    if (!existsSync(bundledCli)) {
      throw new Error(`SDK bundled CLI not found at ${bundledCli}`);
    }
    const version = execFileSync(process.execPath, [bundledCli, "--version"], {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();

    expect(pkg.qwenCode?.recommendedCli).toBe(version);
  });
});
