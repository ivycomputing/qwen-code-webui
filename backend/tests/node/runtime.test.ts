/**
 * Node.js Runtime Basic Functionality Test
 *
 * Simple test to verify that the NodeRuntime implementation
 * works correctly in a Node.js environment. Commands used here must exist
 * on every platform CI runs on (ubuntu-latest, windows-latest, macOS dev).
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import process from "node:process";
import { NodeRuntime } from "../../runtime/node.js";
import { getPlatform } from "../../utils/os.ts";

describe("Node.js Runtime", () => {
  const runtime = new NodeRuntime();

  it("should implement all required interface methods", () => {
    const requiredMethods = [
      "findExecutable",
      "runCommand",
      "serve",
      "createStaticFileMiddleware",
    ];

    for (const method of requiredMethods) {
      expect(
        typeof (runtime as unknown as Record<string, unknown>)[method],
      ).toBe("function");
    }
  });

  it("should execute commands", async () => {
    const result = await runtime.runCommand(process.execPath, ["--version"]);
    expect(result.success).toBe(true);
    expect(result.stdout).toMatch(/\d+\.\d+/);
  });

  it("should execute commands whose path or arguments contain spaces", async () => {
    // On Windows CI, process.execPath is C:\Program Files\...\node.exe, so
    // this exercises the spaces-in-path handling for real there.
    const result = await runtime.runCommand(process.execPath, [
      "-e",
      "console.log('ok 42')",
    ]);
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("ok 42");
  });

  it("should kill commands that exceed timeoutMs", async () => {
    // A cross-platform ~10s sleeper: Windows has no `sleep` command, but
    // `ping -n 11 127.0.0.1` pauses about 10 seconds.
    const isWindows = getPlatform() === "windows";
    const command = isWindows ? "ping" : "sleep";
    const sleeperArgs = isWindows ? ["-n", "11", "127.0.0.1"] : ["10"];

    const start = Date.now();
    const result = await runtime.runCommand(command, sleeperArgs, {
      timeoutMs: 500,
    });
    const elapsed = Date.now() - start;
    expect(result.success).toBe(false);
    expect(result.code).toBe(124);
    expect(result.stderr).toContain("command timed out");
    expect(elapsed).toBeLessThan(5000);
  });

  it("should resolve the SDK-bundled CLI when @qwen-code/sdk is installed", () => {
    const cliPath = runtime.resolveBundledCliPath?.();
    // The SDK ships dist/cli/cli.js with every install; when deps are
    // installed (they are, in dev and CI) the path must resolve and exist.
    expect(cliPath).toBeTruthy();
    expect(cliPath).toContain(join("dist", "cli", "cli.js"));
  });
});

// .cmd scripts only exist on Windows; verified on the windows-latest CI leg.
describe.skipIf(getPlatform() !== "windows")(
  "Node.js Runtime on Windows (.cmd scripts)",
  () => {
    const runtime = new NodeRuntime();

    it("should run .cmd scripts whose path contains spaces", async () => {
      const dir = join(mkdtempSync(join(tmpdir(), "wcmd-")), "dir with spaces");
      mkdirSync(dir, { recursive: true });
      const scriptPath = join(dir, "hello.cmd");
      writeFileSync(scriptPath, "@echo off\r\necho hellofromcmd\r\n");

      const result = await runtime.runCommand(scriptPath, []);
      expect(
        result.success,
        `stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)} code=${result.code}`,
      ).toBe(true);
      expect(result.stdout).toContain("hellofromcmd");
    });
  },
);
