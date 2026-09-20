/**
 * Tests for token authentication middleware
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createTokenAuthMiddleware } from "./tokenAuth.ts";

// Helper to generate v1 token (legacy format)
// SHA256({userId}:{port}:{randomPart}:{secret}).hexdigest()[:16]
async function generateTokenV1(
  userId: number,
  port: number,
  randomPart: string,
  secret: string
): Promise<string> {
  const dataToSign = `${userId}:${port}:${randomPart}:${secret}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(dataToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  const hexHash = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const signature = hexHash.slice(0, 16);
  return `${userId}:${port}:${randomPart}:${signature}`;
}

// Helper to generate v2 token (with TTL)
// SHA256(v2:{userId}:{port}:{timestamp}:{randomPart}:{secret}).hexdigest()[:16]
async function generateTokenV2(
  userId: number,
  port: number,
  timestamp: number,
  randomPart: string,
  secret: string
): Promise<string> {
  const payload = `v2:${userId}:${port}:${timestamp}:${randomPart}`;
  const dataToSign = `${payload}:${secret}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(dataToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  const hexHash = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const signature = hexHash.slice(0, 16);
  return `${payload}:${signature}`;
}

describe("createTokenAuthMiddleware", () => {
  it("should skip validation when tokenSecret is not configured", async () => {
    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(undefined));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should skip validation when tokenSecret is empty", async () => {
    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(""));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should reject request without token when secret is configured", async () => {
    const secret = "test-secret-key";
    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request("/test");
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Missing token");
  });

  it("should reject request with invalid token format", async () => {
    const secret = "test-secret-key";
    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request("/test?token=invalid-format");
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token");
  });

  it("should reject request with invalid signature", async () => {
    const secret = "test-secret-key";
    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    // Token with wrong signature
    const res = await app.request("/test?token=1:3101:abc123:wrongsignature");
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token");
  });

  it("should accept request with valid v1 token", async () => {
    const secret = "test-secret-key";
    const userId = 1;
    const port = 3101;
    const randomPart = "abc123def456";

    const validToken = await generateTokenV1(userId, port, randomPart, secret);

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${validToken}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should accept request with valid v2 token", async () => {
    const secret = "test-secret-key";
    const userId = 1;
    const port = 3101;
    const timestamp = Math.floor(Date.now() / 1000); // Current timestamp
    const randomPart = "abc123def456";

    const validToken = await generateTokenV2(
      userId,
      port,
      timestamp,
      randomPart,
      secret
    );

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${validToken}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should reject expired v2 token", async () => {
    const secret = "test-secret-key";
    const userId = 1;
    const port = 3101;
    // Timestamp 25 hours ago (TTL is 24 hours)
    const timestamp = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    const randomPart = "abc123def456";

    const expiredToken = await generateTokenV2(
      userId,
      port,
      timestamp,
      randomPart,
      secret
    );

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${expiredToken}`);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token");
  });

  it("should accept v2 token near expiry boundary", async () => {
    const secret = "test-secret-key";
    const userId = 1;
    const port = 3101;
    // Timestamp 23 hours ago (within 24 hour TTL)
    const timestamp = Math.floor(Date.now() / 1000) - 23 * 60 * 60;
    const randomPart = "abc123def456";

    const validToken = await generateTokenV2(
      userId,
      port,
      timestamp,
      randomPart,
      secret
    );

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${validToken}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should accept request with valid v1 token containing special characters", async () => {
    const secret = "test-secret-with-special!@#$";
    const userId = 42;
    const port = 9000;
    const randomPart = "a1b2c3d4e5f6";

    const validToken = await generateTokenV1(userId, port, randomPart, secret);

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${encodeURIComponent(validToken)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should accept request with valid v2 token containing special characters", async () => {
    const secret = "test-secret-with-special!@#$";
    const userId = 42;
    const port = 9000;
    const timestamp = Math.floor(Date.now() / 1000);
    const randomPart = "a1b2c3d4e5f6";

    const validToken = await generateTokenV2(
      userId,
      port,
      timestamp,
      randomPart,
      secret
    );

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${encodeURIComponent(validToken)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should reject v1 token generated with different secret", async () => {
    const correctSecret = "correct-secret";
    const wrongSecret = "wrong-secret";
    const userId = 1;
    const port = 3101;
    const randomPart = "abc123";

    // Generate token with wrong secret
    const invalidToken = await generateTokenV1(userId, port, randomPart, wrongSecret);

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(correctSecret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${invalidToken}`);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token");
  });

  it("should reject v2 token generated with different secret", async () => {
    const correctSecret = "correct-secret";
    const wrongSecret = "wrong-secret";
    const userId = 1;
    const port = 3101;
    const timestamp = Math.floor(Date.now() / 1000);
    const randomPart = "abc123";

    // Generate token with wrong secret
    const invalidToken = await generateTokenV2(
      userId,
      port,
      timestamp,
      randomPart,
      wrongSecret
    );

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(correctSecret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${invalidToken}`);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token");
  });

  it("should reject v2 token with invalid format (wrong part count)", async () => {
    const secret = "test-secret-key";
    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    // v2 token with only 5 parts (should be 6)
    const res = await app.request("/test?token=v2:1:3101:1234567890:abc123");
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token");
  });

  it("should reject v2 token with invalid timestamp", async () => {
    const secret = "test-secret-key";
    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    // v2 token with non-numeric timestamp
    const res = await app.request("/test?token=v2:1:3101:notatimestamp:abc123:somesig");
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token");
  });

  it("should reject v2 token with future timestamp", async () => {
    const secret = "test-secret-key";
    const userId = 1;
    const port = 3101;
    // Timestamp 1 hour in the future
    const timestamp = Math.floor(Date.now() / 1000) + 3600;
    const randomPart = "abc123def456";

    const futureToken = await generateTokenV2(
      userId,
      port,
      timestamp,
      randomPart,
      secret
    );

    const app = new Hono();
    app.use("*", createTokenAuthMiddleware(secret));
    app.get("/test", (c) => c.text("OK"));

    const res = await app.request(`/test?token=${futureToken}`);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token");
  });
});

describe("proxy header authentication", () => {
  it("accepts a v2 Bearer token without any query credential", async () => {
    const app = new Hono(); const secret = "synthetic-only";
    app.use("*", createTokenAuthMiddleware(secret)); app.get("/test", c => c.text("OK"));
    const token = await generateTokenV2(7, 8080, Math.floor(Date.now()/1000), "nonce", secret);
    expect((await app.request("/test", {headers:{Authorization:`Bearer ${token}`}})).status).toBe(200);
    // Malformed headers cannot fall back to an otherwise valid query token.
    expect((await app.request(`/test?token=${encodeURIComponent(token)}`, {headers:{Authorization:"Basic malformed"}})).status).toBe(401);
  });
});
