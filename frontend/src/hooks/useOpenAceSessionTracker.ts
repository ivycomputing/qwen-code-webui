/**
 * Hook for tracking session with Open-ACE
 *
 * When running in integrated mode (inside Open-ACE iframe),
 * this hook notifies Open-ACE about session start/end for
 * project statistics tracking.
 *
 * Note: Real-time stats sync has been removed. All session statistics
 * are now extracted from JSONL files by fetch_qwen.py script.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  isIntegratedMode,
  getOpenAceSessionApi,
} from "../api/openace";

interface SessionTracker {
  sessionId: string | null;
  projectPath: string | null;
  startTime: Date | null;
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
    }
  }, [integrated]);

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
    isTracking: !!openAceSessionIdRef.current,
    openAceSessionId: openAceSessionIdRef.current,
  };
}