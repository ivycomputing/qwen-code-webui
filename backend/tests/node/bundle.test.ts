/**
 * Smoke test for the esbuild-bundled Node entry (dist/cli/node.js).
 *
 * Guards against bundle-level regressions that unit tests on source files
 * cannot catch, e.g. duplicate top-level imports colliding with the esbuild
 * banner's `createRequire` declaration (#170, reintroduced while fixing the
 * Deno build in the #277 PR).
 *
 * Skipped when dist/ has not been built (fresh checkout, plain `npm test` in
 * CI). It runs for real in the publish flow, where `prepublishOnly` builds
 * before running tests.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const bundlePath = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  "dist",
  "cli",
  "node.js",
);

describe.skipIf(!existsSync(bundlePath))("esbuild bundle smoke", () => {
  it("dist/cli/node.js loads and answers --version without a SyntaxError", () => {
    const output = execFileSync(process.execPath, [bundlePath, "--version"], {
      encoding: "utf8",
      timeout: 30_000,
    }).trim();
    expect(output).toMatch(/^\d+\.\d+\.\d+/);
  });
});
