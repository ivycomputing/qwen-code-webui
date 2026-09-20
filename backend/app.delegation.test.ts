import { expect, it, vi } from "vitest";
import type { Runtime } from "./runtime/types.ts";

const mockQuery = vi.fn();

vi.mock("./utils/qwenSdk.ts", () => ({
  loadQwenQuery: vi.fn(async () => mockQuery),
}));

vi.mock("./utils/logger.ts", () => ({
  logger: {
    app: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    chat: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  },
}));

import { createApp } from "./app.ts";

async function signedBearer(secret: string): Promise<string> {
  const payload = `v2:1:8091:${Math.floor(Date.now() / 1000)}:${"a".repeat(48)}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${payload}:${secret}`),
  );
  const signature = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("").slice(0, 16);
  return `${payload}:${signature}`;
}

it("passes the configured token secret from app assembly to delegated chat", async () => {
  const secret = "synthetic-server-secret-at-least-32-bytes";
  mockQuery.mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield {
        type: "assistant",
        message: { content: [{ type: "text", text: "ok" }] },
        session_id: "synthetic-session",
      };
    },
  });
  const runtime = {
    createStaticFileMiddleware: () => async (_context: unknown, next: () => Promise<void>) => next(),
  } as unknown as Runtime;
  const { app } = createApp(runtime, {
    debugMode: false,
    staticPath: "/tmp/static",
    cliPath: "/usr/local/bin/qwen",
    tokenSecret: secret,
    serializeChatRequests: true,
    modelProxyBaseUrl: "http://127.0.0.1:9730/internal/job-ai-workbench-model",
    authType: "openai",
  });

  const response = await app.request("http://127.0.0.1:8091/api/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await signedBearer(secret)}`,
      "Content-Type": "application/json",
      "X-Model-Proxy-Token": "g".repeat(48),
    },
    body: JSON.stringify({ message: "verify", requestId: "assembly-test" }),
  });

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('"type":"done"');
});
