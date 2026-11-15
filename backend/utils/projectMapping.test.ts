/**
 * Tests for project path decoding, focusing on the Windows / CLI 1.0 fix.
 *
 * The Unix heuristic only understands encoded names with a leading "-" and
 * cannot reverse Windows drive-letter names (e.g. "C--Users-...") or paths with
 * spaces. decodeProjectPath must fall back to the authoritative `cwd` recorded
 * in the project's session files and persist it to the mapping.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decodeProjectPath, readProjectPathMapping } from "./projectMapping.ts";

const state = vi.hoisted(() => ({ home: "" }));

vi.mock("./os.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./os.ts")>();
  return { ...actual, getHomeDir: () => state.home };
});

const ENCODED = "C--Users-test-Desktop-New-folder";

describe("decodeProjectPath cwd recovery", () => {
  let testDir: string;
  let projectDir: string;
  let workspace: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `proj-map-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    state.home = testDir;
    projectDir = join(testDir, ".qwen", "projects", ENCODED);
    workspace = join(testDir, "workspace");
    await mkdir(projectDir, { recursive: true });
    await mkdir(workspace, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("recovers a Windows-style project path from session cwd and caches it", async () => {
    // First line mirrors CLI 1.0 relaxed-JSON metadata (must be skipped); the
    // second is a strict-JSON message carrying the authoritative cwd.
    const content =
      "{type:workspace-directories,directories:[C:\\Users\\test\\Desktop\\New folder]}\n" +
      JSON.stringify({
        type: "user",
        sessionId: "s1",
        timestamp: new Date().toISOString(),
        uuid: "u1",
        cwd: workspace,
      }) +
      "\n";
    await writeFile(join(projectDir, "s1.jsonl"), content);

    const decoded = await decodeProjectPath(
      ENCODED,
      async (p) => p === workspace,
    );
    expect(decoded).toBe(workspace);

    // The recovered path must be persisted so later lookups skip file reads.
    const mapping = await readProjectPathMapping();
    expect(mapping[ENCODED]).toBe(workspace);
  });

  it("reads cwd from the legacy chats/ subdirectory as well", async () => {
    const chatsDir = join(projectDir, "chats");
    await mkdir(chatsDir, { recursive: true });
    await writeFile(
      join(chatsDir, "s2.jsonl"),
      JSON.stringify({ type: "user", cwd: workspace }) + "\n",
    );

    const decoded = await decodeProjectPath(
      ENCODED,
      async (p) => p === workspace,
    );
    expect(decoded).toBe(workspace);
  });

  it("returns null when no session file carries a usable cwd", async () => {
    await writeFile(
      join(projectDir, "s3.jsonl"),
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "hi" },
      }) + "\n",
    );

    const decoded = await decodeProjectPath(ENCODED, async () => true);
    expect(decoded).toBeNull();
  });

  it("prefers an existing mapping entry over session recovery", async () => {
    const configDir = join(testDir, ".qwen-code-webui");
    await mkdir(configDir, { recursive: true });
    const mapped = join(testDir, "already-mapped");
    await mkdir(mapped, { recursive: true });
    await writeFile(
      join(configDir, "project-mapping.json"),
      JSON.stringify({ [ENCODED]: mapped }),
    );

    const decoded = await decodeProjectPath(ENCODED, async (p) => p === mapped);
    expect(decoded).toBe(mapped);
  });
});
