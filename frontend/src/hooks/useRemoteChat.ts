import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  createRemoteSession,
  sendRemoteMessage,
  stopRemoteSession,
  abortRemoteRequest,
  getRemoteSessionStatus,
  createRemoteSessionStreamWithReconnect,
  type SSEConnectionState,
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

type RemoteRequestStateEvent = {
  type: "aborted" | "abort_failed";
  reason?: string;
  message?: string;
};

export function useRemoteChat(options?: RemoteChatOptions) {
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sseState, setSseState] = useState<SSEConnectionState>("connected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortAckTimerRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const { t } = useTranslation();

  // Use ref to always have fresh options in SSE callbacks (avoids stale closures)
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Clear orphaned streaming state (thinking/assistant) from StreamingContext
  const clearStreamingState = useCallback(() => {
    const opts = optionsRef.current;
    if (opts?.streamingContext?.setCurrentThinkingMessage) {
      opts.streamingContext.setCurrentThinkingMessage(null);
    }
    if (opts?.streamingContext?.setCurrentAssistantMessage) {
      opts.streamingContext.setCurrentAssistantMessage(null);
    }
  }, []);

  const clearAbortAckTimer = useCallback(() => {
    if (abortAckTimerRef.current !== null) {
      window.clearTimeout(abortAckTimerRef.current);
      abortAckTimerRef.current = null;
    }
  }, []);

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

      if (parsed.type === "request_state" && parsed.data) {
        const requestState = parsed.data as RemoteRequestStateEvent;
        if (requestState.type === "aborted") {
          clearAbortAckTimer();
          setIsStopping(false);
          setIsLoading(false);
          clearStreamingState();
          return;
        }
        if (requestState.type === "abort_failed") {
          clearAbortAckTimer();
          setIsStopping(false);
          setError(requestState.message || "Failed to stop remote request");
          return;
        }
      }

      // Detect result events to clear loading state
      if (parsed.type === "claude_json" && parsed.data?.type === "result") {
        clearAbortAckTimer();
        setIsStopping(false);
        setIsLoading(false);
      }

      // Handle error events from the remote agent (e.g. CLI crash, send failure)
      if (parsed.type === "error") {
        clearAbortAckTimer();
        setIsStopping(false);
        setIsLoading(false);
        setError(parsed.data || "Unknown remote error");
        return; // Don't forward to onStreamLine
      }
    } catch { /* not JSON, ignore */ }

    // Forward to stream processor
    const opts = optionsRef.current;
    if (opts?.onStreamLine && opts.streamingContext) {
      opts.onStreamLine(line, opts.streamingContext);
    }
  }, [clearAbortAckTimer, clearStreamingState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      clearAbortAckTimer();
    };
  }, [clearAbortAckTimer]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const startSession = useCallback(
    async (
      machineId: string,
      projectPath: string,
      model?: string,
      cliTool?: string,
      permissionMode?: string,
      haPoolToken?: string
    ) => {
      setIsLoading(true);
      clearAbortAckTimer();
      setIsStopping(false);
      setError(null);
      setSession(null);

      try {
        const response = await createRemoteSession(
          machineId,
          projectPath,
          model,
          cliTool,
          permissionMode,
          haPoolToken
        );

        setSession(response.session);

        // Open SSE connection — read options from ref to avoid stale closure
        const currentOptions = optionsRef.current;
        if (currentOptions?.onStreamLine && currentOptions.streamingContext) {
          const es = createRemoteSessionStreamWithReconnect(
            response.session.session_id,
            {
              onLine: (line) => {
                handleSSELine(line);
              },
              onError: (err) => {
                console.error("[useRemoteChat] SSE error:", err);
                setError(t("chat.remoteDisconnected"));
                clearAbortAckTimer();
                setIsStopping(false);
                setIsLoading(false);
                clearStreamingState();
                setSession((prev) =>
                  prev ? { ...prev, status: "error" } : null
                );
              },
              onDone: () => {
                console.log("[useRemoteChat] SSE done");
                clearAbortAckTimer();
                setIsStopping(false);
                setIsLoading(false);
                clearStreamingState();
                // If the session was active and SSE closed, it likely means
                // the server was restarted or the session was marked completed.
                if (session?.status === "active") {
                  setError(t("chat.remoteEnded"));
                  setSession((prev) =>
                    prev ? { ...prev, status: "completed" } : null
                  );
                }
              },
              onStateChange: (state) => {
                setSseState(state);
              },
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
      clearAbortAckTimer();
      setIsStopping(false);
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

          const es = createRemoteSessionStreamWithReconnect(
            s.session_id,
            {
              onLine: (line) => {
                handleSSELine(line);
              },
              onError: (err) => {
                console.error("[useRemoteChat] SSE error:", err);
                setError(t("chat.remoteReconnectFailed"));
                clearAbortAckTimer();
                setIsStopping(false);
                setIsLoading(false);
                clearStreamingState();
                setSession((prev) =>
                  prev ? { ...prev, status: "error" } : null
                );
              },
              onDone: () => {
                console.log("[useRemoteChat] SSE done");
                clearAbortAckTimer();
                setIsStopping(false);
                setIsLoading(false);
                clearStreamingState();
              },
              onStateChange: (state) => {
                setSseState(state);
              },
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
      clearAbortAckTimer();
      setIsStopping(false);
      setError(null);
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
    [clearAbortAckTimer, session]
  );

  const abortCurrentRequest = useCallback(async (reason = "user") => {
    if (!session || isStopping) return;
    try {
      setIsStopping(true);
      setError(null);
      await abortRemoteRequest(session.session_id, reason);
      abortAckTimerRef.current = window.setTimeout(() => {
        setIsStopping(false);
        setError("Remote stop was not confirmed");
      }, 5000);
    } catch (err) {
      clearAbortAckTimer();
      setIsStopping(false);
      console.error("[useRemoteChat] Failed to abort request:", err);
      setError(
        err instanceof Error ? err.message : "Failed to abort remote request"
      );
    }
  }, [clearAbortAckTimer, isStopping, session]);

  const stopSessionHandler = useCallback(async () => {
    if (!session) return;

    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      await stopRemoteSession(session.session_id);
      clearAbortAckTimer();
      setIsStopping(false);
      setIsLoading(false);
      setSession((prev) => (prev ? { ...prev, status: "stopped" } : null));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to stop remote session"
      );
    }
  }, [clearAbortAckTimer, session]);

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
    clearAbortAckTimer();
    setSession(null);
    setError(null);
    setIsStopping(false);
    setIsLoading(false);
  }, [clearAbortAckTimer, session]);

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
    isStopping,
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
    sseState,
  };
}
