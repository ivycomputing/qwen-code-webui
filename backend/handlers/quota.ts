/**
 * Quota handler - Check quota with Open-ACE before processing requests
 *
 * This handler integrates with Open-ACE to check user quota before allowing
 * chat requests. If quota is exceeded, it returns an error response.
 */

import type { Context } from "hono";
import { logger } from "../utils/logger.ts";
import { getEnv } from "../utils/os.ts";

// Open-ACE API configuration
// Default to disabled since Open-ACE integration is optional
const QUOTA_CHECK_ENABLED = getEnv("QUOTA_CHECK_ENABLED") === "true";
const OPENACE_API_URL = getEnv("OPENACE_API_URL") || "http://localhost:5000";

interface QuotaStatus {
  can_use: boolean;
  daily: {
    tokens: { used: number; limit: number | null; over_quota: boolean };
    requests: { used: number; limit: number | null; over_quota: boolean };
  };
  monthly: {
    tokens: { used: number; limit: number | null; over_quota: boolean };
    requests: { used: number; limit: number | null; over_quota: boolean };
  };
  over_quota?: {
    daily_token: boolean;
    daily_request: boolean;
    monthly_token: boolean;
    monthly_request: boolean;
    any: boolean;
  };
}

/**
 * Check quota with Open-ACE
 * Returns quota status or null if check fails
 */
export async function checkQuota(sessionToken?: string): Promise<QuotaStatus | null> {
  if (!QUOTA_CHECK_ENABLED) {
    return { can_use: true } as QuotaStatus;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }

    const response = await fetch(`${OPENACE_API_URL}/api/quota/check`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      logger.api.warn(`Quota check failed: ${response.status}`);
      // If quota check fails, allow the request (fail open)
      return { can_use: true } as QuotaStatus;
    }

    const data = await response.json();
    return data as QuotaStatus;
  } catch (error) {
    logger.api.error(`Quota check error: ${error}`);
    // Fail open - allow request if quota check fails
    return { can_use: true } as QuotaStatus;
  }
}

/**
 * Get quota status for display
 */
export async function handleQuotaStatusRequest(c: Context) {
  try {
    // Try to get session token from cookie or header
    const sessionToken = c.req.header("Authorization")?.replace("Bearer ", "") ||
      c.req.header("X-Session-Token");

    const status = await checkQuota(sessionToken);

    if (!status) {
      return c.json({
        can_use: true,
        error: "Unable to check quota",
      }, 200);
    }

    return c.json(status);
  } catch (error) {
    logger.api.error(`Error in quota status: ${error}`);
    return c.json({
      can_use: true,
      error: String(error),
    }, 500);
  }
}

/**
 * Middleware to check quota before processing chat requests
 */
export async function quotaCheckMiddleware(c: Context, next: () => Promise<void>) {
  if (!QUOTA_CHECK_ENABLED) {
    await next();
    return;
  }

  try {
    // Try to get session token from cookie or header
    const sessionToken = c.req.header("Authorization")?.replace("Bearer ", "") ||
      c.req.header("X-Session-Token");

    const status = await checkQuota(sessionToken);

    if (status && !status.can_use) {
      // Quota exceeded
      return c.json({
        error: "quota_exceeded",
        message: "Your quota has been exceeded. Please contact your administrator.",
        quota_status: status,
      }, 403);
    }
  } catch (error) {
    logger.api.error(`Quota middleware error: ${error}`);
    // Fail open - continue if check fails
  }

  await next();
}