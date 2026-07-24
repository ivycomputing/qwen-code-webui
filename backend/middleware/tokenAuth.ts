/**
 * Token authentication middleware for Open-ACE integration
 *
 * When --token-secret is configured, this middleware validates tokens
 * from URL query parameters to ensure requests come from authorized Open-ACE users.
 *
 * Token format: {user_id}:{port}:{random}:{signature}
 * Signature: SHA256({user_id}:{port}:{random}:{secret}).hexdigest()[:16]
 *
 * If --token-secret is not configured, the middleware skips validation,
 * allowing standalone usage without Open-ACE integration.
 */

import { createMiddleware } from "hono/factory";
import { logger } from "../utils/logger.ts";

/**
 * Computes SHA256 hash and returns hex string
 *
 * @param data Data to hash
 * @returns Hex string of the hash
 */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  // Use Web Crypto API (async version for Node.js compatibility)
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  const hexHash = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hexHash;
}

/**
 * Validates a v2 format token with TTL support
 *
 * @param token Token string to validate (v2:{user_id}:{port}:{timestamp}:{random}:{signature})
 * @param secret Secret key for signature verification
 * @returns True if token is valid, false otherwise
 */
async function validateTokenV2(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split(":");
    if (parts.length !== 6) {
      logger.app.warn("Invalid v2 token format: expected 6 parts");
      return false;
    }

    const [version, userId, port, timestamp, randomPart, signature] = parts;

    if (version !== "v2") {
      logger.app.warn("Invalid v2 token: wrong version prefix");
      return false;
    }

    // Check TTL (30 minutes = 1800 seconds)
    const TTL_SECONDS = 1800;
    const tokenTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    const ageSeconds = currentTime - tokenTime;

    if (ageSeconds > TTL_SECONDS) {
      logger.app.warn("v2 token expired: age {age}s, TTL: {ttl}s", {
        age: ageSeconds,
        ttl: TTL_SECONDS,
      });
      return false;
    }

    if (ageSeconds < 0) {
      logger.app.warn("v2 token timestamp is in the future");
      return false;
    }

    // Verify signature
    const payload = `v2:${userId}:${port}:${timestamp}:${randomPart}`;
    const dataToSign = `${payload}:${secret}`;
    const hexHash = await sha256Hex(dataToSign);
    const expectedSignature = hexHash.slice(0, 16);

    if (signature !== expectedSignature) {
      logger.app.warn("v2 token signature mismatch");
      return false;
    }

    logger.app.debug("v2 token validated successfully for user {userId}", {
      userId,
    });
    return true;
  } catch (error) {
    logger.app.error("v2 token validation error: {error}", { error });
    return false;
  }
}

/**
 * Validates a v1 format token (legacy, no TTL)
 *
 * @param token Token string to validate ({user_id}:{port}:{random}:{signature})
 * @param secret Secret key for signature verification
 * @returns True if token is valid, false otherwise
 */
async function validateTokenV1(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split(":");
    if (parts.length !== 4) {
      logger.app.warn("Invalid v1 token format: expected 4 parts");
      return false;
    }

    const [userId, port, randomPart, signature] = parts;

    // Compute expected signature using same algorithm as Open-ACE
    const dataToSign = `${userId}:${port}:${randomPart}:${secret}`;
    const hexHash = await sha256Hex(dataToSign);
    const expectedSignature = hexHash.slice(0, 16);

    if (signature !== expectedSignature) {
      logger.app.warn("v1 token signature mismatch");
      return false;
    }

    logger.app.debug("v1 token validated successfully for user {userId}", {
      userId,
    });
    return true;
  } catch (error) {
    logger.app.error("v1 token validation error: {error}", { error });
    return false;
  }
}

/**
 * Validates a token against the expected signature
 * Supports both v1 (legacy) and v2 (with TTL) formats
 *
 * @param token Token string to validate
 * @param secret Secret key for signature verification
 * @returns True if token is valid, false otherwise
 */
async function validateToken(token: string, secret: string): Promise<boolean> {
  // v2 format: v2:{user_id}:{port}:{timestamp}:{random}:{signature}
  if (token.startsWith("v2:")) {
    return validateTokenV2(token, secret);
  }

  // v1 format: {user_id}:{port}:{random}:{signature}
  return validateTokenV1(token, secret);
}

/**
 * Creates token authentication middleware
 *
 * @param tokenSecret Secret key for token validation. If undefined or empty,
 *                    the middleware skips validation (standalone mode).
 * @returns Hono middleware function
 */
export function createTokenAuthMiddleware(tokenSecret?: string) {
  return createMiddleware(async (c, next) => {
    // Skip validation if no secret is configured (standalone mode)
    if (!tokenSecret) {
      await next();
      return;
    }

    // Get token from URL query parameter
    const token = c.req.query("token");

    if (!token) {
      logger.app.warn("Request rejected: missing token parameter");
      return c.text("Unauthorized: Missing token", 401);
    }

    // Validate token
    if (!(await validateToken(token, tokenSecret))) {
      logger.app.warn("Request rejected: invalid token");
      return c.text("Unauthorized: Invalid token", 401);
    }

    // Token is valid, proceed to next handler
    await next();
  });
}

/**
 * Type for context with token auth
 */
export type TokenAuthContext = {
  Variables: {
    tokenSecret?: string;
  };
};