import { Context } from "hono";
import type { PermissionRespondRequest } from "../../shared/types.ts";
import type { PermissionResult } from "@qwen-code/sdk";
import { logger } from "../utils/logger.ts";

export interface PendingPermission {
  resolve: (result: PermissionResult, scope?: "specific" | "all") => void;
  abortSignal: AbortSignal;
}

export async function handlePermissionRespond(
  c: Context,
  pendingPermissions: Map<string, PendingPermission>,
) {
  const body = await c.req.json<PermissionRespondRequest>();
  if (!body?.permissionId || !body?.behavior) {
    return c.json({ error: "Missing permissionId or behavior" }, 400);
  }
  if (body.behavior !== "allow" && body.behavior !== "deny") {
    return c.json({ error: "Invalid behavior" }, 400);
  }

  const pending = pendingPermissions.get(body.permissionId);
  if (!pending) {
    logger.chat.warn("Permission response for unknown ID: {permissionId}", {
      permissionId: body.permissionId,
    });
    return c.json({ error: "Permission request not found or expired" }, 404);
  }
  if (pending.abortSignal.aborted) {
    pendingPermissions.delete(body.permissionId);
    return c.json({ error: "Request was aborted" }, 410);
  }

  pendingPermissions.delete(body.permissionId);

  if (body.behavior === "allow") {
    // Include answers in updatedInput for ask_user_question tool
    const updatedInput = body.updatedInput || {};
    if (body.answers) {
      updatedInput.answers = body.answers;
    }
    pending.resolve({
      behavior: "allow",
      updatedInput,
    }, body.scope);
  } else {
    const message = body.message
      ? `${body.message} [proactive]`
      : `User denied this tool call [proactive]`;
    pending.resolve({
      behavior: "deny",
      message,
    });
  }

  logger.chat.debug("Permission {behavior} for {permissionId}", {
    behavior: body.behavior,
    permissionId: body.permissionId,
  });
  return c.json({ success: true });
}
