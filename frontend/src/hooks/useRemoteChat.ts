import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  createRemoteSession,
  sendRemoteMessage,
  stopRemoteSession,
  abortRemoteRequest,
  getRemoteSessionStatus,
  createRemoteSessionStream,
  sendPermissionResponse,
  switchRemoteModel,
  pauseRemoteSession,
  resumeRemoteSession,
  type RemoteSession,
} from "../api/openace";
import type { StreamingContext } from "./streaming/useMessageProcessor";

export interface PermissionRequestEvent {
  type: "control_request";
  request_id: string;
  request: {
    subtype: string;
    tool_name: string;
    tool_use_id?: string;
    input?: Record<string, unknown>;
    permission_suggestions?: Array<{
      rule: string;
      description: string;
    }>;
  };
}

export interface RemoteChatOptions {
  onStreamLine?: (line: string, context: StreamingContext) => void;
  streamingContext?: StreamingContext;
  onPermissionRequest?: (event: PermissionRequestEvent) => void;
  onQuotaExceeded?: (quotaStatus: unknown) => void;
}

export function useRemoteChat(options?: RemoteChatOptions) {
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sendingRef = useRef(false);
  const { t } = useTranslation();

  // Use ref to always have fresh options in SSE callbacks (avoids stale closures)
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /**
   * Shared SSE line handler — detects permission_request events, result
   * events, and forwards regular output via onStreamLine.
   */
  const handleSSELine = useCallback((line: string) => {
    try {
      const parsed = JSON.parse(line);

      // Handle permission_request from the remote CLI
      if (parsed.type === "permission_request" && parsed.data) {
        const opts = optionsRef.current;
        if (opts?.onPermissionRequest) {
          opts.onPermissionRequest(parsed.data as PermissionRequestEvent);
        }
        return; // Don't forward to onStreamLine
      }

      // Detect result events to clear loading state
      if (parsed.type === "claude_json" && parsed.data?.type === "result") {
        setIsLoading(false);
      }
    } catch { /* not JSON, ignore */ }

    // Forward to stream processor
    const opts = optionsRef.current;
    if (opts?.onStreamLine && opts.streamingContext) {
      opts.onStreamLine(line, opts.streamingContext);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const startSession = useCallback(
    async (
      machineId: string,
      projectPath: string,
      model?: string,
      cliTool?: string,
      permissionMode?: string
    ) => {
      setIsLoading(true);
      setError(null);
      setSession(null);

      try {
        const response = await createRemoteSession(
          machineId,
          projectPath,
          model,
          cliTool,
          permissionMode
        );

        setSession(response.session);

        // Open SSE connection — read options from ref to avoid stale closure
        const currentOptions = optionsRef.current;
        if (currentOptions?.onStreamLine && currentOptions.streamingContext) {
          console.log("[useRemoteChat] Opening SSE for session:", response.session.session_id);
          const es = createRemoteSessionStream(
            response.session.session_id,
            (line) => {
              handleSSELine(line);
            },
            (err) => {
              console.error("[useRemoteChat] SSE error:", err);
              setError(t("chat.remoteDisconnected"));
              setIsLoading(false);
              setSession((prev) =>
                prev ? { ...prev, status: "error" } : null
              );
            },
            () => {
              console.log("[useRemoteChat] SSE done");
              setIsLoading(false);
              // If the session was active and SSE closed, it likely means
              // the server was restarted or the session was marked completed.
              if (session?.status === "active") {
                setError(t("chat.remoteEnded"));
                setSession((prev) =>
                  prev ? { ...prev, status: "completed" } : null
                );
              }
            },
          );
          eventSourceRef.current = es;
          // SSE is a long-lived background connection — once opened the
          // session is established and the user should be able to type.
          setIsLoading(false);
        } else {
          console.warn("[useRemoteChat] No onStreamLine/streamingContext provided, SSE not opened", {
            hasOnStreamLine: !!currentOptions?.onStreamLine,
            hasStreamingContext: !!currentOptions?.streamingContext,
          });
          setIsLoading(false);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to start remote session"
        );
        setIsLoading(false);
      }
    },
    [] // Empty deps — uses optionsRef for fresh values
  );

  /**
   * Connect to an existing remote session (created by open-ace) without
   * creating a new one.  Fetches session status, opens SSE, and stores
   * the session reference so sendMessage works.
   */
  const connectSession = useCallback(
    async (sessionId: string) => {
      if (session) return; // already connected

      setIsLoading(true);
      setError(null);

      try {
        const response = await getRemoteSessionStatus(sessionId);
        if (!response.success || !response.session) {
          setError(t("chat.remoteNotFound"));
          setIsLoading(false);
          return;
        }

        // Check session is actually usable
        const s = response.session;
        if (s.status !== "active" && s.status !== "paused") {
          setError(t("chat.remoteEndedCreate"));
          setIsLoading(false);
          return;
        }

        setSession(s);

        const currentOptions = optionsRef.current;
        if (currentOptions?.onStreamLine && currentOptions.streamingContext) {
          // 1) Replay DB-stored messages (user always; assistant/system only
          //    when output buffer is empty, i.e. server restarted)
          const dbMessages = (s as { messages?: Array<{ role: string; content: string }> }).messages;
          const output = (s as { output?: Array<{ data: string; stream: string }> }).output;
          const hasOutputBuffer = output && output.length > 0;

          if (dbMessages && dbMessages.length > 0) {
            for (const msg of dbMessages) {
              if (!msg.content) continue;
              if (msg.role === "user") {
                const userLine = JSON.stringify({
                  type: "claude_json",
                  data: {
                    type: "user",
                    session_id: s.session_id,
                    message: { role: "user", content: msg.content },
                  },
                });
                handleSSELine(userLine);
              } else if (!hasOutputBuffer && (msg.role === "assistant" || msg.role === "system")) {
                // Only replay AI/system from DB when output buffer is empty
                // (server restarted). Otherwise buffer has richer data.
                handleSSELine(msg.content);
              }
            }
          }

          // 2) Replay buffered output (stdout + permission entries)
          //    Only used when server did NOT restart (buffer still alive).
          if (hasOutputBuffer) {
            for (const entry of output) {
              if (!entry.data) continue;
              if (entry.stream === "permission") {
                try {
                  const wrapped = JSON.stringify({
                    type: "permission_request",
                    data: JSON.parse(entry.data),
                  });
                  handleSSELine(wrapped);
                } catch { /* skip unparseable */ }
              } else if (entry.stream === "stdout") {
                handleSSELine(entry.data);
              }
            }
          }

          const es = createRemoteSessionStream(
            s.session_id,
            (line) => {
              handleSSELine(line);
            },
            (err) => {
              console.error("[useRemoteChat] SSE error:", err);
              setError(t("chat.remoteReconnectFailed"));
              setIsLoading(false);
              setSession((prev) =>
                prev ? { ...prev, status: "error" } : null
              );
            },
            () => {
              console.log("[useRemoteChat] SSE done");
              setIsLoading(false);
            },
          );
          eventSourceRef.current = es;
        }
        setIsLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to connect to remote session"
        );
        setIsLoading(false);
      }
    },
    [session, handleSSELine, t]
  );

  const sendMessage = useCallback(
    async (content: string, permissionMode?: string) => {
      if (!session) {
        setError("No active remote session");
        return;
      }

      // Prevent double-sends
      if (sendingRef.current) return;
      sendingRef.current = true;
      setIsLoading(true);

      try {
        await sendRemoteMessage(session.session_id, content, permissionMode);
      } catch (err) {
        // Check for quota exceeded (HTTP 403)
        const httpErr = err as Error & { status?: number; quotaStatus?: unknown };
        if (httpErr.status === 403 && httpErr.quotaStatus) {
          const opts = optionsRef.current;
          opts?.onQuotaExceeded?.(httpErr.quotaStatus);
          setIsLoading(false);
          return;
        }
        const msg = err instanceof Error ? err.message : "Failed to send remote message";
        setIsLoading(false);
        setError(msg);
      } finally {
        sendingRef.current = false;
      }
    },
    [session]
  );

  const abortCurrentRequest = useCallback(async () => {
    if (!session) return;
    try {
      await abortRemoteRequest(session.session_id);
    } catch (err) {
      console.error("[useRemoteChat] Failed to abort request:", err);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const stopSessionHandler = useCallback(async () => {
    if (!session) return;

    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      await stopRemoteSession(session.session_id);
      setSession((prev) => (prev ? { ...prev, status: "stopped" } : null));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to stop remote session"
      );
    }
  }, [session]);

  const resetSession = useCallback(async () => {
    if (session) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      try {
        await stopRemoteSession(session.session_id);
      } catch (err) {
        console.error("[useRemoteChat] Failed to stop session during reset:", err);
      }
    }
    setSession(null);
    setError(null);
    setIsLoading(false);
  }, [session]);

  const reconnect = useCallback(
    async (machineId: string, projectPath: string, model?: string) => {
      // Close old SSE
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setSession(null);
      setError(null);
      await startSession(machineId, projectPath, model);
    },
    [startSession]
  );

  const handlePermissionResponse = useCallback(
    async (requestId: string, behavior: "allow" | "allow-permanent" | "deny", message?: string, toolName?: string) => {
      if (!session) return;
      try {
        await sendPermissionResponse(session.session_id, requestId, behavior, message, toolName);
      } catch (err) {
        console.error("[useRemoteChat] Failed to send permission response:", err);
      }
    },
    [session]
  );

  const switchModel = useCallback(
    async (model: string) => {
      if (!session) return;
      try {
        await switchRemoteModel(session.session_id, model);
        setSession((prev) => prev ? { ...prev, model } : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to switch model");
      }
    },
    [session]
  );

  const pauseSession = useCallback(
    async () => {
      if (!session) return;
      try {
        const result = await pauseRemoteSession(session.session_id);
        if (result.success) {
          setSession((prev) => prev ? { ...prev, status: "paused" } : null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to pause session");
      }
    },
    [session]
  );

  const resumeSession = useCallback(
    async () => {
      if (!session) return;
      try {
        const result = await resumeRemoteSession(session.session_id);
        if (result.success) {
          setSession((prev) => prev ? { ...prev, status: "active" } : null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resume session");
      }
    },
    [session]
  );

  return {
    session,
    isLoading,
    sendMessage,
    startSession,
    connectSession,
    stopSession: stopSessionHandler,
    abortCurrentRequest,
    resetSession,
    reconnect,
    switchModel,
    pauseSession,
    resumeSession,
    sendPermissionResponse: handlePermissionResponse,
    error,
  };
}
