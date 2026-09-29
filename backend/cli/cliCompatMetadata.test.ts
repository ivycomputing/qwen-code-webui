/**
 * Guards the machine-readable CLI-compatibility metadata in backend/package.json.
 *
 * Downstream consumers (e.g. open-ace's upgrade automation) read the
 * `qwenCode` object via `npm view qwen-code-webui qwenCode` to derive the
 * host CLI version pair that this WebUI release was tested against. These
 * tests keep that metadata in sync with the actual constants the runtime
 * enforces, so a version-range bump cannot ship without updating both.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MIN_TESTED_CLI_VERSION,
  MAX_TESTED_CLI_VERSION,
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
    const { recommendedCli } = pkg.qwenCode!;
    const [rMaj, rMin, rPatch] = recommendedCli.split(".").map(Number);
    const [minMaj, minMin, minPatch] =
      MIN_TESTED_CLI_VERSION.split(".").map(Number);
    const [maxMaj, maxMin, maxPatch] =
      MAX_TESTED_CLI_VERSION.split(".").map(Number);

    const belowMin =
      rMaj < minMaj ||
      (rMaj === minMaj && rMin < minMin) ||
      (rMaj === minMaj && rMin === minMin && rPatch < minPatch);
    const aboveMax =
      rMaj > maxMaj ||
      (rMaj === maxMaj && rMin > maxMin) ||
      (rMaj === maxMaj && rMin === maxMin && rPatch > maxPatch);

    expect(belowMin).toBe(false);
    expect(aboveMax).toBe(false);
  });
});
