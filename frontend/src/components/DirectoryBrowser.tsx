import { useState, useEffect, useCallback, Fragment } from "react";
import {
  FolderIcon,
  HomeIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  FolderPlusIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import {
  browseDirectory,
  type DirectoryInfo,
  type BrowseResponse,
} from "../api/openace";

interface DirectoryBrowserProps {
  onSelectDirectory: (path: string) => void;
  onClose?: () => void;
  initialPath?: string;
}

export function DirectoryBrowser({
  onSelectDirectory,
  initialPath,
}: DirectoryBrowserProps) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDirName, setNewDirName] = useState("");
  const [showNewDirInput, setShowNewDirInput] = useState(false);

  const loadDirectory = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    setShowNewDirInput(false);
    setNewDirName("");

    try {
      const response: BrowseResponse = await browseDirectory(path);

      if (response.error && response.fallback) {
        // Use fallback if available
        setCurrentPath(response.fallback.currentPath);
        setParentPath(response.fallback.parentPath);
        setDirectories(response.fallback.directories);
        setCanCreate(response.fallback.canCreate);
        setError(response.error);
      } else {
        setCurrentPath(response.currentPath);
        setParentPath(response.parentPath);
        setDirectories(response.directories);
        setCanCreate(response.canCreate);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("directoryBrowser.failedToBrowse"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadDirectory(initialPath);
  }, [initialPath, loadDirectory]);

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

  const handleCreateNewDir = () => {
    if (!newDirName.trim()) return;

    const newPath = currentPath
      ? `${currentPath}/${newDirName.trim()}`.replace(/\/+/g, "/")
      : newDirName.trim();

    onSelectDirectory(newPath);
  };

  // Parse path into segments for breadcrumb
  const pathSegments = currentPath.split(/[/\\]/).filter(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600 dark:text-slate-400">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[400px]" onKeyDown={(e) => {
      // Allow Enter to select current folder when not in new folder input mode
      if (e.key === "Enter" && !showNewDirInput) {
        e.preventDefault();
        handleSelectCurrent();
      }
    }}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-t-lg border-b border-slate-200 dark:border-slate-600">
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
                  const partialPath = "/" + pathSegments.slice(0, index + 1).join("/");
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
            <p>{t("directoryBrowser.noSubdirectories")}</p>
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
                  <span className="text-slate-700 dark:text-slate-200">{dir.name}</span>
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

      {/* New directory input */}
      {showNewDirInput ? (
        <div className="p-3 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              placeholder={t("directoryBrowser.newDirectoryName")}
              className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateNewDir();
                } else if (e.key === "Escape") {
                  setShowNewDirInput(false);
                  setNewDirName("");
                }
              }}
            />
            <button
              onClick={handleCreateNewDir}
              disabled={!newDirName.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("common.create")}
            </button>
            <button
              onClick={() => {
                setShowNewDirInput(false);
                setNewDirName("");
              }}
              className="px-3 py-2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-500"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        /* Footer with actions */
        <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30">
          <button
            onClick={() => setShowNewDirInput(true)}
            disabled={!canCreate}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderPlusIcon className="h-4 w-4" />
            {t("directoryBrowser.newFolder")}
          </button>

          <button
            onClick={handleSelectCurrent}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            {t("directoryBrowser.selectThisFolder")}
          </button>
        </div>
      )}
    </div>
  );
}