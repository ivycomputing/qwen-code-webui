#!/usr/bin/env node
/**
 * CI guard: the npm and Deno builds must ship the same @qwen-code/sdk version.
 *
 * Node resolves the SDK through package-lock.json; Deno resolves it from
 * package.json into deno.lock (backend/deno.json deliberately does not pin
 * the SDK — see issue #277). This script fails when the two lockfiles drift
 * apart, so a Dependabot npm bump that skips `deno install` cannot merge.
 *
 * Known limitation: it compares lockfile against lockfile. A manual
 * package.json edit without `npm install` is not caught — Dependabot always
 * updates manifest and lockfile together, which is the workflow this guards.
 *
 * Usage: node scripts/check-sdk-version-sync.js [package-lock.json] [deno.lock]
 * (paths default to the files next to this script's package root)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageLockPath =
  process.argv[2] ?? join(packageRoot, "package-lock.json");
const denoLockPath = process.argv[3] ?? join(packageRoot, "deno.lock");

function fail(message) {
  console.error(`❌ SDK version sync check failed: ${message}`);
  process.exit(1);
}

const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
const npmVersion =
  packageLock.packages?.["node_modules/@qwen-code/sdk"]?.version;
if (!npmVersion) {
  fail(
    "package-lock.json has no node_modules/@qwen-code/sdk entry — was the dependency removed?",
  );
}

const denoLock = readFileSync(denoLockPath, "utf8");
const denoVersions = [
  ...new Set(
    [...denoLock.matchAll(/@qwen-code\/sdk@(\d+\.\d+\.\d+)/g)].map(
      (match) => match[1],
    ),
  ),
];

if (denoVersions.length === 0) {
  fail(
    "deno.lock does not reference @qwen-code/sdk at all — run `deno install` in backend/ to regenerate it",
  );
}
if (denoVersions.length > 1) {
  fail(
    `deno.lock references multiple SDK versions: ${denoVersions.join(", ")}`,
  );
}
if (denoVersions[0] !== npmVersion) {
  fail(
    `deno.lock has @qwen-code/sdk ${denoVersions[0]} but package-lock.json has ${npmVersion} — run \`deno install\` in backend/ to resync`,
  );
}

console.log(
  `✅ @qwen-code/sdk consistent at ${npmVersion} across package-lock.json and deno.lock`,
);
