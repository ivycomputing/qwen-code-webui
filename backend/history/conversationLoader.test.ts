/**
 * Tests for loadConversation session-layout handling.
 *
 * Verifies the CLI 1.0 fix: sessions written to the project root (instead of
 * the legacy chats/ subdirectory) must still load. Previously the loader only
 * checked chats/, so CLI 1.0 sessions listed in history returned 404 on open.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConversation } from "./conversationLoader.ts";

const state = vi.hoisted(() => ({ home: "" }));

vi.mock("../utils/os.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/os.ts")>();
  return { ...actual, getHomeDir: () => state.home };
});

const ENCODED = "C--Users-test-Desktop-project";
const SESSION_ID = "session-abc-123";

function userLine(text: string): string {
  return (
    JSON.stringify({
      type: "user",
      message: { role: "user", content: text },
      sessionId: SESSION_ID,
      timestamp: new Date().toISOString(),
      uuid: "uuid-1",
      cwd: "C:\\Users\\test\\Desktop\\project",
    }) + "\n"
  );
}

describe("loadConversation session layout", () => {
  let testDir: string;
  let projectDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `conv-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    state.home = testDir;
    projectDir = join(testDir, ".qwen", "projects", ENCODED);
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("loads a legacy session from chats/", async () => {
    const chatsDir = join(projectDir, "chats");
    await mkdir(chatsDir, { recursive: true });
    await writeFile(
      join(chatsDir, `${SESSION_ID}.jsonl`),
      userLine("from-chats"),
    );

    const result = await loadConversation(ENCODED, SESSION_ID);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe(SESSION_ID);
    expect((result!.messages[0] as any).message.content).toBe("from-chats");
  });

  it("loads a CLI 1.0 session from the project root when chats/ is absent", async () => {
    await writeFile(
      join(projectDir, `${SESSION_ID}.jsonl`),
      userLine("from-root"),
    );

    const result = await loadConversation(ENCODED, SESSION_ID);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe(SESSION_ID);
    expect((result!.messages[0] as any).message.content).toBe("from-root");
  });

  it("prefers chats/ when the session exists in both locations", async () => {
    const chatsDir = join(projectDir, "chats");
    await mkdir(chatsDir, { recursive: true });
    await writeFile(
      join(chatsDir, `${SESSION_ID}.jsonl`),
      userLine("from-chats"),
    );
    await writeFile(
      join(projectDir, `${SESSION_ID}.jsonl`),
      userLine("from-root"),
    );

    const result = await loadConversation(ENCODED, SESSION_ID);
    expect(result).not.toBeNull();
    expect((result!.messages[0] as any).message.content).toBe("from-chats");
  });

  it("returns null when the session exists in neither location", async () => {
    const result = await loadConversation(ENCODED, SESSION_ID);
    expect(result).toBeNull();
  });
});
