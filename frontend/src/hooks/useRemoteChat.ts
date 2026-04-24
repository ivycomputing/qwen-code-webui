import { useState, useCallback, useEffect, useRef } from "react";
import {
  createRemoteSession,
  sendRemoteMessage,
  stopRemoteSession,
  getRemoteSessionStatus,
  createRemoteSessionStream,
  sendPermissionResponse,
  switchRemoteModel,
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
}

export function useRemoteChat(options?: RemoteChatOptions) {
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sendingRef = useRef(false);

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
              setError("远程会话连接断开，请刷新页面重新创建会话");
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
                setError("远程会话已结束，请刷新页面重新创建会话");
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
          setError("远程会话不存在或已结束");
          setIsLoading(false);
          return;
        }

        // Check session is actually usable
        const s = response.session;
        if (s.status !== "active" && s.status !== "paused") {
          setError("远程会话已结束，请创建新会话");
          setIsLoading(false);
          return;
        }

        setSession(s);

        const currentOptions = optionsRef.current;
        if (currentOptions?.onStreamLine && currentOptions.streamingContext) {
          const es = createRemoteSessionStream(
            s.session_id,
            (line) => {
              handleSSELine(line);
            },
            (err) => {
              console.error("[useRemoteChat] SSE error:", err);
              setError("远程会话连接断开，请重新连接");
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
    [session]
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
        const msg = err instanceof Error ? err.message : "Failed to send remote message";
        setIsLoading(false);
        setError(msg);
      } finally {
        sendingRef.current = false;
      }
    },
    [session]
  );

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
    async (requestId: string, behavior: "allow" | "deny", message?: string, toolName?: string) => {
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

  return {
    session,
    isLoading,
    sendMessage,
    startSession,
    connectSession,
    stopSession: stopSessionHandler,
    resetSession,
    reconnect,
    switchModel,
    sendPermissionResponse: handlePermissionResponse,
    error,
  };
}
