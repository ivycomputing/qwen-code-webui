import { useState, useEffect, useCallback, Fragment, useRef } from "react";
import {
  FolderIcon,
  HomeIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import {
  browseRemoteDirectory,
  type DirectoryInfo,
  type BrowseResponse,
} from "../api/openace";

interface RemoteDirectoryBrowserProps {
  machineId: string;
  onSelectDirectory: (path: string) => void;
  onClose: () => void;
}

export function RemoteDirectoryBrowser({
  machineId,
  onSelectDirectory,
  onClose,
}: RemoteDirectoryBrowserProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(
    async (path?: string) => {
      setLoading(true);
      setError(null);

      try {
        const response: BrowseResponse = await browseRemoteDirectory(
          machineId,
          path
        );

        if (response.error && response.fallback) {
          setCurrentPath(response.fallback.currentPath);
          setParentPath(response.fallback.parentPath);
          setDirectories(response.fallback.directories);
          setError(response.error);
        } else {
          setCurrentPath(response.currentPath);
          setParentPath(response.parentPath);
          setDirectories(response.directories);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("remoteDirectory.failedToBrowse")
        );
      } finally {
        setLoading(false);
      }
    },
    [machineId]
  );

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Auto-focus when loading completes
  useEffect(() => {
    if (!loading && containerRef.current) {
      containerRef.current.focus();
    }
  }, [loading]);

  const handleNavigate = (path: string) => {
    loadDirectory(path);
  };

  const handleGoHome = () => {
    loadDirectory();
  };

  const handleGoUp = () => {
    if (parentPath) {
      loadDirectory(parentPath);
    }
  };

  const handleSelectCurrent = () => {
    onSelectDirectory(currentPath);
  };

  // Parse path into segments for breadcrumb
  const pathSegments = currentPath.split(/[/\\]/).filter(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <svg
          className="animate-spin h-6 w-6 text-blue-600 mr-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-slate-600 dark:text-slate-400">
          {t("remoteDirectory.loadingRemote")}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-[400px]"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSelectCurrent();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-700/50 rounded-t-lg border-b border-slate-200 dark:border-slate-600">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {t("remoteDirectory.remoteMachine")}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400"
          title={t("common.cancel")}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
        <button
          onClick={handleGoHome}
          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"
          title={t("directoryBrowser.home")}
        >
          <HomeIcon className="h-5 w-5" />
        </button>

        {parentPath && (
          <button
            onClick={handleGoUp}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"
            title={t("directoryBrowser.goUp")}
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
        )}

        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          <span className="text-slate-400 dark:text-slate-500">/</span>
          {pathSegments.map((segment, index) => (
            <Fragment key={index}>
              <button
                onClick={() => {
                  const partialPath =
                    "/" + pathSegments.slice(0, index + 1).join("/");
                  handleNavigate(partialPath);
                }}
                className="text-sm text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap"
              >
                {segment}
              </button>
              {index < pathSegments.length - 1 && (
                <ChevronRightIcon className="h-4 w-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
              )}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-700 dark:text-yellow-400">{error}</p>
        </div>
      )}

      {/* Directory list */}
      <div className="flex-1 overflow-y-auto p-2">
        {directories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400">
            <FolderIcon className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">{t("remoteDirectory.noSubdirectories")}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {directories.map((dir) => (
              <button
                key={dir.path}
                onClick={() => handleNavigate(dir.path)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 group"
              >
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
                  <span className="text-slate-700 dark:text-slate-200">
                    {dir.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {dir.isWritable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDirectory(dir.path);
                      }}
                      className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                    >
                      {t("common.select")}
                    </button>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {dir.isWritable ? t("directoryBrowser.writable") : t("directoryBrowser.readOnly")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer with select button */}
      <div className="flex items-center justify-end p-3 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30">
        <button
          onClick={handleSelectCurrent}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          {t("directoryBrowser.selectThisFolder")}
        </button>
      </div>
    </div>
  );
}
