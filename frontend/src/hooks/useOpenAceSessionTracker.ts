/**
 * Hook for tracking session with Open-ACE
 *
 * When running in integrated mode (inside Open-ACE iframe),
 * this hook notifies Open-ACE about session start/end for
 * project statistics tracking.
 * Also syncs usage statistics during conversation for session list display.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  isIntegratedMode,
  getOpenAceSessionApi,
  updateSessionStats,
} from "../api/openace";

interface SessionTracker {
  sessionId: string | null;
  projectPath: string | null;
  startTime: Date | null;
}

// Track cumulative stats for the session
interface CumulativeStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  requestCount: number;
}

export function useOpenAceSessionTracker(
  currentSessionId: string | null,
  projectPath: string | null,
  isActive: boolean = true
) {
  const trackerRef = useRef<SessionTracker>({
    sessionId: null,
    projectPath: null,
    startTime: null,
  });
  const openAceSessionIdRef = useRef<string | null>(null);
  const cumulativeStatsRef = useRef<CumulativeStats>({
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    messageCount: 0,
    requestCount: 0,
  });

  const integrated = isIntegratedMode();

  // Start tracking when a new session begins
  const startTracking = useCallback(async (sessionId: string, path: string) => {
    if (!integrated || !path) return;

    // Don't restart if already tracking this session
    if (trackerRef.current.sessionId === sessionId) return;

    // End previous session if any
    if (openAceSessionIdRef.current) {
      await endTracking();
    }

    try {
      const response = await fetch(getOpenAceSessionApi(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool_name: "qwen-code",
          session_type: "chat",
          project_path: path,
          title: `Session in ${path.split("/").pop()}`,
          session_id: sessionId,  // Pass the qwen CLI session_id to backend for consistency
        }),
      });

      if (response.ok) {
        const data = await response.json();
        openAceSessionIdRef.current = data.data?.session_id;
        trackerRef.current = {
          sessionId,
          projectPath: path,
          startTime: new Date(),
        };
        console.log("[Open-ACE] Started tracking session:", openAceSessionIdRef.current);
      }
    } catch (error) {
      console.error("[Open-ACE] Failed to start session tracking:", error);
    }
  }, [integrated]);

  // End tracking when session ends
  const endTracking = useCallback(async () => {
    if (!integrated || !openAceSessionIdRef.current) return;

    const sessionId = openAceSessionIdRef.current;

    try {
      await fetch(getOpenAceSessionApi(sessionId, "complete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      console.log("[Open-ACE] Ended tracking session:", sessionId);
    } catch (error) {
      console.error("[Open-ACE] Failed to end session tracking:", error);
    } finally {
      openAceSessionIdRef.current = null;
      trackerRef.current = {
        sessionId: null,
        projectPath: null,
        startTime: null,
      };
      // Reset cumulative stats
      cumulativeStatsRef.current = {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        messageCount: 0,
        requestCount: 0,
      };
    }
  }, [integrated]);

  // Update session statistics (called when receiving usageMetadata from assistant message)
  const updateStats = useCallback(async (
    usageMetadata: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    },
    model?: string
  ) => {
    if (!integrated || !currentSessionId) return;

    // Accumulate stats
    const stats = cumulativeStatsRef.current;
    if (usageMetadata.totalTokenCount) {
      stats.totalTokens += usageMetadata.totalTokenCount;
    }
    if (usageMetadata.promptTokenCount) {
      stats.inputTokens += usageMetadata.promptTokenCount;
    }
    if (usageMetadata.candidatesTokenCount) {
      stats.outputTokens += usageMetadata.candidatesTokenCount;
    }
    stats.requestCount += 1;  // Each assistant message is one request

    // Sync to Open-ACE (debounced - only sync every 5 seconds or on significant change)
    try {
      await updateSessionStats(currentSessionId, {
        total_tokens: stats.totalTokens,
        total_input_tokens: stats.inputTokens,
        total_output_tokens: stats.outputTokens,
        request_count: stats.requestCount,
        model: model,
      });
      console.log("[Open-ACE] Updated session stats:", {
        sessionId: currentSessionId,
        totalTokens: stats.totalTokens,
        requestCount: stats.requestCount,
      });
    } catch (error) {
      console.error("[Open-ACE] Failed to update session stats:", error);
    }
  }, [integrated, currentSessionId]);

  // Track session changes
  useEffect(() => {
    if (!isActive || !integrated) return;

    if (currentSessionId && projectPath) {
      startTracking(currentSessionId, projectPath);
    }

    // Cleanup on unmount or when session becomes inactive
    return () => {
      if (openAceSessionIdRef.current) {
        // Use navigator.sendBeacon for reliable cleanup on page unload
        const sessionId = openAceSessionIdRef.current;
        const url = getOpenAceSessionApi(sessionId, "complete");
        
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url);
        }
      }
    };
  }, [currentSessionId, projectPath, isActive, integrated, startTracking]);

  // Handle page unload
  useEffect(() => {
    if (!integrated) return;

    const handleBeforeUnload = () => {
      if (openAceSessionIdRef.current) {
        const sessionId = openAceSessionIdRef.current;
        const url = getOpenAceSessionApi(sessionId, "complete");
        navigator.sendBeacon(url);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [integrated]);

  return {
    startTracking,
    endTracking,
    updateStats,
    isTracking: !!openAceSessionIdRef.current,
    openAceSessionId: openAceSessionIdRef.current,
  };
}