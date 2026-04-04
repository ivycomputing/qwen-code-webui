/**
 * Quota handler - Check quota with Open-ACE before processing requests
 *
 * This handler integrates with Open-ACE to check user quota before allowing
 * chat requests. If quota is exceeded, it returns an error response.
 *
 * Configuration is read from config context (set via CLI args or env vars).
 * Non-integrated mode: quotaCheckEnabled is false, all checks are skipped.
 */

import type { Context } from "hono";
import { logger } from "../utils/logger.ts";
import { getEnv } from "../utils/os.ts";
import type { ConfigContext } from "../middleware/config.ts";

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
}

/**
 * Check quota with Open-ACE using webui token
 * Returns quota status or null if check fails (fail-open)
 */
export async function checkQuota(
  openaceApiUrl: string,
  webuiToken?: string,
): Promise<QuotaStatus | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (webuiToken) {
      headers["Authorization"] = `Bearer ${webuiToken}`;
    }

    const response = await fetch(`${openaceApiUrl}/api/quota/webui-check`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      logger.api.warn(`Quota check failed: ${response.status}`);
      return { can_use: true } as QuotaStatus; // fail-open
    }
    return await response.json();
  } catch (error) {
    logger.api.error(`Quota check error: ${error}`);
    return { can_use: true } as QuotaStatus; // fail-open
  }
}

/**
 * Get quota status for display
 */
export async function handleQuotaStatusRequest(c: Context<ConfigContext>) {
  const config = c.get("config");
  if (!config.quotaCheckEnabled) {
    return c.json({ can_use: true });
  }
  const openaceApiUrl = config.openaceApiUrl || getEnv("OPENACE_API_URL") || "http://localhost:5000";
  const webuiToken = c.req.query("token");
  const status = await checkQuota(openaceApiUrl, webuiToken);
  return c.json(status || { can_use: true, error: "Unable to check quota" });
}

/**
 * Middleware to check quota before processing chat requests
 */
export async function quotaCheckMiddleware(c: Context<ConfigContext>, next: () => Promise<void>) {
  const config = c.get("config");
  if (!config.quotaCheckEnabled) {
    await next();
    return;
  }

  try {
    const openaceApiUrl = config.openaceApiUrl || getEnv("OPENACE_API_URL") || "http://localhost:5000";
    const webuiToken = c.req.query("token");

    const status = await checkQuota(openaceApiUrl, webuiToken);
    if (status && !status.can_use) {
      return c.json({
        error: "quota_exceeded",
        message: "Your quota has been exceeded. Please contact your administrator.",
        quota_status: status,
      }, 403);
    }
  } catch (error) {
    logger.api.error(`Quota middleware error: ${error}`);
  }
  await next();
}
