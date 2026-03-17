/**
 * Web Platform Context Adapter for @qwen-code/webui
 *
 * This adapter provides a web-specific implementation of the PlatformContext
 * interface required by the @qwen-code/webui component library.
 */

import { createContext, useContext, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

/**
 * Platform types supported by the webui library
 */
export type PlatformType = "vscode" | "chrome" | "web" | "share";

/**
 * Platform context interface for cross-platform component reuse
 */
export interface WebPlatformContextValue {
  /** Current platform identifier */
  platform: PlatformType;

  /** Send message to platform host (no-op for web) */
  postMessage: (message: unknown) => void;

  /** Subscribe to messages from platform host (no-op for web) */
  onMessage: (handler: (message: unknown) => void) => () => void;

  /** Open a file in the platform's editor (optional) */
  openFile?: (path: string) => void;

  /** Open a diff view for a file (optional) */
  openDiff?: (
    path: string,
    oldText: string | null | undefined,
    newText: string | undefined,
  ) => void;

  /** Open a temporary file with given content (optional) */
  openTempFile?: (content: string, fileName?: string) => void;

  /** Trigger file attachment dialog (optional) */
  attachFile?: () => void;

  /** Trigger platform login flow (optional) */
  login?: () => void;

  /** Copy text to clipboard */
  copyToClipboard?: (text: string) => Promise<void>;

  /** Get resource URL for platform-specific assets */
  getResourceUrl?: (resourceName: string) => string | undefined;

  /** Platform-specific feature flags */
  features?: {
    canOpenFile?: boolean;
    canOpenDiff?: boolean;
    canOpenTempFile?: boolean;
    canAttachFile?: boolean;
    canLogin?: boolean;
    canCopy?: boolean;
  };
}

/**
 * Default context value for web platform
 */
const defaultWebContext: WebPlatformContextValue = {
  platform: "web",
  postMessage: () => {
    // No-op for web platform - no external host to communicate with
  },
  onMessage: () => {
    // No-op for web platform - return cleanup function
    return () => {};
  },
  features: {
    canOpenFile: false,
    canOpenDiff: false,
    canOpenTempFile: true,
    canAttachFile: false,
    canLogin: false,
    canCopy: true,
  },
};

/**
 * Web Platform Context
 */
export const WebPlatformContext =
  createContext<WebPlatformContextValue>(defaultWebContext);

/**
 * Hook to access web platform context
 */
export function useWebPlatform(): WebPlatformContextValue {
  return useContext(WebPlatformContext);
}

/**
 * Provider component props
 */
export interface WebPlatformProviderProps {
  children: ReactNode;
  value?: Partial<WebPlatformContextValue>;
}

/**
 * Web Platform Context Provider Component
 *
 * Provides platform-specific capabilities for web environment.
 * Can be extended with custom implementations via the value prop.
 */
export function WebPlatformProvider({
  children,
  value,
}: WebPlatformProviderProps) {
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textArea);
      }
    }
  }, []);

  const openTempFile = useCallback((content: string, fileName?: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "temp-file.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const contextValue = useMemo(
    () => ({
      ...defaultWebContext,
      copyToClipboard,
      openTempFile,
      ...value,
      features: {
        ...defaultWebContext.features,
        ...value?.features,
      },
    }),
    [copyToClipboard, openTempFile, value],
  );

  return (
    <WebPlatformContext.Provider value={contextValue}>
      {children}
    </WebPlatformContext.Provider>
  );
}

/**
 * Re-export types and hooks for convenience
 */
export type { PlatformType as WebPlatformType };
export type { WebPlatformContextValue as PlatformContextValue };