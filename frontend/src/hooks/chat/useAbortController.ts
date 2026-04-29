import { useCallback } from "react";
import { getAbortUrl, getPermissionRespondUrl } from "../../config/api";

export function useAbortController() {
  // Helper function to perform abort request
  const performAbortRequest = useCallback(async (requestId: string) => {
    await fetch(getAbortUrl(requestId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  }, []);

  const abortRequest = useCallback(
    async (
      requestId: string | null,
      isLoading: boolean,
      onAbortComplete: () => void,
    ) => {
      if (!requestId || !isLoading) return;

      try {
        await performAbortRequest(requestId);
      } catch (error) {
        console.error("Failed to abort request:", error);
      } finally {
        // Clean up state after successful abort or error
        onAbortComplete();
      }
    },
    [performAbortRequest],
  );

  const createAbortHandler = useCallback(
    (requestId: string) => async () => {
      try {
        await performAbortRequest(requestId);
      } catch (error) {
        console.error("Failed to abort request:", error);
      }
    },
    [performAbortRequest],
  );

  return {
    abortRequest,
    createAbortHandler,
  };
}

/**
 * Send a permission response to the backend for proactive canUseTool flow.
 * Standalone function (not a hook) since it's a simple HTTP POST.
 */
export async function sendPermissionResponse(
  permissionId: string,
  behavior: "allow" | "deny",
  options?: { message?: string; updatedInput?: Record<string, unknown> },
): Promise<Response> {
  return fetch(getPermissionRespondUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissionId, behavior, ...options }),
  });
}
