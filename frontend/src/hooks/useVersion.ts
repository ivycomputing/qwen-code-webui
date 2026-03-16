import { useState, useEffect } from "react";

interface VersionInfo {
  version: string;
}

interface UseVersionResult {
  version: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useVersion(): UseVersionResult {
  const [version, setVersion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await fetch("/api/version");
        if (!response.ok) {
          throw new Error("Failed to fetch version");
        }
        const data: VersionInfo = await response.json();
        setVersion(data.version);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVersion();
  }, []);

  return { version, isLoading, error };
}