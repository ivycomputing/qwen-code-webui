/**
 * Tests for the Windows command-line construction used by NodeRuntime.runCommand.
 *
 * Only .cmd/.bat scripts go through cmd.exe (they cannot be spawned
 * directly); the whole command line is quoted with /d /s /c so paths with
 * spaces survive cmd's re-parsing. Everything else spawns directly and lets
 * Node quote arguments for CreateProcess.
 */

import { describe, it, expect } from "vitest";
import { buildWindowsCommandLine, isWindowsScriptFile } from "./node.ts";

describe("isWindowsScriptFile", () => {
  it("recognizes .cmd and .bat files case-insensitively", () => {
    expect(isWindowsScriptFile("C:\\tools\\qwen.cmd")).toBe(true);
    expect(isWindowsScriptFile("C:\\tools\\QWEN.CMD")).toBe(true);
    expect(isWindowsScriptFile("C:\\tools\\setup.bat")).toBe(true);
  });

  it("rejects executables and bare names", () => {
    expect(isWindowsScriptFile("C:\\Program Files\\nodejs\\node.exe")).toBe(
      false,
    );
    expect(isWindowsScriptFile("where")).toBe(false);
    expect(isWindowsScriptFile("C:\\tools\\qwen.ps1")).toBe(false);
  });
});

describe("buildWindowsCommandLine", () => {
  it("builds a /d /s /c command line quoting a path with spaces", () => {
    expect(
      buildWindowsCommandLine("C:\\Program Files\\tools\\qwen.cmd", [
        "--version",
      ]),
    ).toEqual([
      "/d",
      "/s",
      "/c",
      '"C:\\Program Files\\tools\\qwen.cmd" --version',
    ]);
  });

  it("quotes arguments that contain spaces", () => {
    expect(
      buildWindowsCommandLine("C:\\t\\qwen.cmd", [
        "C:\\My Files\\cli.js",
        "--version",
      ]),
    ).toEqual([
      "/d",
      "/s",
      "/c",
      '"C:\\t\\qwen.cmd" "C:\\My Files\\cli.js" --version',
    ]);
  });

  it("leaves simple tokens unquoted", () => {
    expect(buildWindowsCommandLine("C:\\t\\qwen.cmd", ["--version"])).toEqual([
      "/d",
      "/s",
      "/c",
      '"C:\\t\\qwen.cmd" --version',
    ]);
  });
});
