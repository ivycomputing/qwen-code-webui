import { useState, useEffect, useCallback } from "react";
import type { FileChange, GitStatusResponse } from "../types/fileChanges";
import { getGitStatusUrl } from "../config/api";
import { fetchRemoteGitStatus } from "../api/openace";

interface FileChangesResult {
  files: FileChange[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
}

const POLL_INTERVAL = 5000;

export function useFileChanges(
  workingDirectory: string | undefined,
  enabled = true,
  remoteWorkspace = false,
  machineId?: string,
): FileChangesResult {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = useCallback(
    async (showLoading = true) => {
      if (!enabled || !workingDirectory) return;
      // Remote mode requires machineId
      if (remoteWorkspace && !machineId) return;

      if (showLoading) {
        setIsLoading(true);
      }
      if (showLoading) {
        setError(null);
      }

      try {
        if (remoteWorkspace && machineId) {
          // Remote mode: fetch via Open-ACE proxy
          const data = await fetchRemoteGitStatus(machineId, workingDirectory);
          if (!data.success) {
            throw new Error(data.error || "Failed to load remote changes");
          }
          setFiles(data.result?.files || []);
        } else {
          // Local mode: use local git API (unchanged behavior)
          const url = getGitStatusUrl(workingDirectory);
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data: GitStatusResponse = await response.json();
          setFiles(data.files || []);
        }
      } catch (err) {
        if (showLoading) {
          setError(
            err instanceof Error ? err.message : "Failed to load changes",
          );
        }
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
        setLastUpdated(new Date());
      }
    },
    [enabled, workingDirectory, remoteWorkspace, machineId],
  );

  const refresh = useCallback(() => {
    fetchStatus(true);
  }, [fetchStatus]);

  // Reset and fetch when workingDirectory changes
  // Note: fetchStatus changes identity when workingDirectory changes (useCallback dep),
  // so this fires once per directory change as expected.
  useEffect(() => {
    setFiles([]);
    setError(null);
    if (enabled && workingDirectory) {
      fetchStatus();
    }
  }, [enabled, workingDirectory, fetchStatus]);

  // Polling (pause when tab is hidden)
  useEffect(() => {
    if (!enabled || !workingDirectory) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchStatus(false);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [enabled, workingDirectory, fetchStatus]);

  return { files, isLoading, error, refresh, lastUpdated };
}
