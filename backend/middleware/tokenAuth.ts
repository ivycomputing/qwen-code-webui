/**
 * Token authentication middleware for Open-ACE integration
 *
 * When --token-secret is configured, this middleware validates tokens
 * from URL query parameters to ensure requests come from authorized Open-ACE users.
 *
 * Supports two token formats:
 *
 * v2 format (recommended): v2:{user_id}:{port}:{timestamp}:{random}:{signature}
 *   - Includes timestamp for TTL validation (default 24 hours, configurable via TOKEN_TTL_SECONDS env)
 *   - Signature: SHA256(v2:{user_id}:{port}:{timestamp}:{random}:{secret})[:16]
 *
 * v1 format (legacy): {user_id}:{port}:{random}:{signature}
 *   - No TTL support
 *   - Signature: SHA256({user_id}:{port}:{random}:{secret})[:16]
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
 * Token TTL in seconds
 *
 * Default: 24 hours (86400 seconds), matching Open-ACE default
 * Can be configured via TOKEN_TTL_SECONDS environment variable
 *
 * Note: This should match OPENACE_WEBUI_TOKEN_TTL_SECONDS in Open-ACE backend
 */
const TOKEN_TTL_SECONDS = (() => {
  const parsed = parseInt(process.env.TOKEN_TTL_SECONDS || "86400", 10);
  return isNaN(parsed) || parsed <= 0 ? 86400 : parsed;
})();

/**
 * Validates a v2 format token with TTL support
 *
 * @param parts Token parts (already split by ":")
 * @param secret Secret key for signature verification
 * @returns True if token is valid, false otherwise
 */
async function validateTokenV2(
  parts: string[],
  secret: string
): Promise<{ valid: boolean; userId?: string }> {
  // v2 format: v2:{user_id}:{port}:{timestamp}:{random}:{signature}
  if (parts.length !== 6) {
    logger.app.warn("Invalid v2 token format: expected 6 parts");
    return { valid: false };
  }

  const [version, userId, port, timestamp, randomPart, signature] = parts;

  // Verify version prefix
  if (version !== "v2") {
    logger.app.warn("Invalid v2 token: missing v2 prefix");
    return { valid: false };
  }

  // Validate timestamp is a number
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    logger.app.warn("Invalid v2 token: invalid timestamp");
    return { valid: false };
  }

  // Check timestamp validity (TTL and future timestamp)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const tokenAge = currentTimestamp - timestampNum;

  // Reject tokens with future timestamp (matching Open-ACE behavior)
  if (tokenAge < 0) {
    logger.app.warn("Token timestamp is in the future");
    return { valid: false };
  }

  // Check TTL (token expiration)
  if (tokenAge > TOKEN_TTL_SECONDS) {
    logger.app.warn(
      "Token expired: age={age}s, max={ttl}s",
      { age: tokenAge, ttl: TOKEN_TTL_SECONDS }
    );
    return { valid: false };
  }

  // Compute expected signature using same algorithm as Open-ACE
  // Signature: SHA256(v2:{user_id}:{port}:{timestamp}:{random}:{secret})[:16]
  const payload = `v2:${userId}:${port}:${timestamp}:${randomPart}`;
  const hexHash = await sha256Hex(`${payload}:${secret}`);
  const expectedSignature = hexHash.slice(0, 16);

  if (signature !== expectedSignature) {
    logger.app.warn("v2 token signature mismatch");
    return { valid: false };
  }

  logger.app.debug("v2 token validated successfully for user {userId}", {
    userId,
  });
  return { valid: true, userId };
}

/**
 * Validates a v1 format token (legacy, no TTL)
 *
 * @param parts Token parts (already split by ":")
 * @param secret Secret key for signature verification
 * @returns True if token is valid, false otherwise
 */
async function validateTokenV1(
  parts: string[],
  secret: string
): Promise<{ valid: boolean; userId?: string }> {
  // v1 format: {user_id}:{port}:{random}:{signature}
  if (parts.length !== 4) {
    logger.app.warn("Invalid v1 token format: expected 4 parts");
    return { valid: false };
  }

  const [userId, port, randomPart, signature] = parts;

  // Compute expected signature using same algorithm as Open-ACE
  // Signature: SHA256({user_id}:{port}:{random}:{secret})[:16]
  const dataToSign = `${userId}:${port}:${randomPart}:${secret}`;
  const hexHash = await sha256Hex(dataToSign);
  const expectedSignature = hexHash.slice(0, 16);

  if (signature !== expectedSignature) {
    logger.app.warn("v1 token signature mismatch");
    return { valid: false };
  }

  logger.app.debug("v1 token validated successfully for user {userId}", {
    userId,
  });
  return { valid: true, userId };
}

/**
 * Validates a token against the expected signature
 *
 * Supports both v2 (with TTL) and v1 (legacy) formats.
 *
 * @param token Token string to validate
 * @param secret Secret key for signature verification
 * @returns True if token is valid, false otherwise
 */
async function validateToken(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split(":");

    // v2 format: starts with "v2:" and has 6 parts
    if (token.startsWith("v2:")) {
      const result = await validateTokenV2(parts, secret);
      return result.valid;
    }

    // v1 format: 4 parts (legacy, no TTL)
    const result = await validateTokenV1(parts, secret);
    return result.valid;
  } catch (error) {
    logger.app.error("Token validation error: {error}", { error });
    return false;
  }
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

    // Proxies can keep tokens out of URLs, browser storage and access logs.
    // A Bearer Authorization header is authoritative (RFC 9110 auth schemes
    // are case-insensitive): never fall back to a query token after failed
    // Bearer authentication. Other schemes — e.g. Basic credentials a fronting
    // auth proxy forwards — do not carry a webui token, so those requests may
    // still present it via the query string.
    const authorization = c.req.header("Authorization");
    let token: string | undefined;
    if (authorization === undefined) {
      token = c.req.query("token");
    } else if (/^Bearer\s+([^\s]+)$/i.test(authorization)) {
      token = authorization.replace(/^Bearer\s+/i, "");
    } else if (!/^\s*Bearer\b/i.test(authorization)) {
      token = c.req.query("token");
    }

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