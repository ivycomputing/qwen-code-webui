import { useState, useEffect, useCallback } from "react";
import type { FileChange, GitStatusResponse } from "../types/fileChanges";
import { getGitStatusUrl } from "../config/api";

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
): FileChangesResult {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = useCallback(
    async (showLoading = true) => {
      if (!workingDirectory) return;

      if (showLoading) {
        setIsLoading(true);
      }
      if (showLoading) {
        setError(null);
      }

      try {
        const url = getGitStatusUrl(workingDirectory);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data: GitStatusResponse = await response.json();
        setFiles(data.files);
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
    [workingDirectory],
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
    if (workingDirectory) {
      fetchStatus();
    }
  }, [workingDirectory, fetchStatus]);

  // Polling (pause when tab is hidden)
  useEffect(() => {
    if (!workingDirectory) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchStatus(false);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [workingDirectory, fetchStatus]);

  return { files, isLoading, error, refresh, lastUpdated };
}
