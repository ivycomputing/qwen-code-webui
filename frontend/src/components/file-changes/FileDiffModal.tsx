import { useState, useEffect, useCallback } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import type { FileChange, GitDiffResponse } from "../../types/fileChanges";
import { getGitDiffUrl } from "../../config/api";
import { useSettings } from "../../hooks/useSettings";

interface FileDiffModalProps {
  isOpen: boolean;
  file: FileChange | null;
  workingDirectory: string;
  onClose: () => void;
}

type ViewMode = "diff" | "file";
type DiffView = "split" | "unified";

export function FileDiffModal({
  isOpen,
  file,
  workingDirectory,
  onClose,
}: FileDiffModalProps) {
  const { t } = useTranslation();
  const { theme } = useSettings();
  const [diffData, setDiffData] = useState<GitDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("diff");
  const [diffView, setDiffView] = useState<DiffView>("unified");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fetchDiff = useCallback(async () => {
    if (!file || !workingDirectory) return;

    setLoading(true);
    setError(null);
    try {
      const url = getGitDiffUrl(workingDirectory, file.path);
      const response = await fetch(url);
      if (response.ok) {
        const data: GitDiffResponse = await response.json();
        setDiffData(data);
      } else {
        setError(`Failed to load diff (HTTP ${response.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setLoading(false);
    }
  }, [file, workingDirectory]);

  useEffect(() => {
    if (isOpen && file) {
      fetchDiff();
    }
    if (!isOpen) {
      setDiffData(null);
      setError(null);
      setViewMode("diff");
      setIsFullscreen(false);
    }
  }, [isOpen, file, fetchDiff]);

  if (!file) return null;

  const isDark = theme === "dark";

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div
            className={
              isFullscreen
                ? "flex min-h-full items-stretch justify-stretch p-2 sm:p-4"
                : "flex min-h-full items-center justify-center p-4"
            }
          >
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={`w-full transform overflow-hidden bg-white dark:bg-slate-800 shadow-xl transition-all flex flex-col ${
                  isFullscreen
                    ? "max-w-none h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] rounded-lg"
                    : "max-w-5xl rounded-xl"
                }`}
                style={{ maxHeight: isFullscreen ? "none" : "85vh" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {file.path}
                    </h3>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                        file.status === "added"
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          : file.status === "deleted"
                            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                            : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                      }`}
                    >
                      {file.status === "added"
                        ? "+"
                        : file.status === "deleted"
                          ? "-"
                          : "~"}{" "}
                      {file.status === "added"
                        ? t("fileChanges.status.added")
                        : file.status === "deleted"
                          ? t("fileChanges.status.deleted")
                          : t("fileChanges.status.modified")}
                    </span>
                    <span className="text-xs font-mono">
                      {file.additions > 0 && (
                        <span className="text-green-600 dark:text-green-400">
                          +{file.additions}{" "}
                        </span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-red-600 dark:text-red-400">
                          -{file.deletions}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setIsFullscreen((value) => !value)}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      title={
                        isFullscreen
                          ? t("fileChanges.diff.exitFullscreen")
                          : t("fileChanges.diff.fullscreen")
                      }
                    >
                      {isFullscreen ? (
                        <ArrowsPointingInIcon className="w-5 h-5" />
                      ) : (
                        <ArrowsPointingOutIcon className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={onClose}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      title={t("chat.dismiss")}
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 flex-shrink-0">
                  <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                    <button
                      onClick={() => setViewMode("diff")}
                      className={`px-2.5 py-1 text-xs font-medium ${
                        viewMode === "diff"
                          ? "bg-blue-500 text-white"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      {t("fileChanges.diff.diffView")}
                    </button>
                    <button
                      onClick={() => setViewMode("file")}
                      className={`px-2.5 py-1 text-xs font-medium ${
                        viewMode === "file"
                          ? "bg-blue-500 text-white"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      {t("fileChanges.diff.fullFile")}
                    </button>
                  </div>
                  {viewMode === "diff" && (
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                      <button
                        onClick={() => setDiffView("unified")}
                        className={`px-2.5 py-1 text-xs font-medium ${
                          diffView === "unified"
                            ? "bg-blue-500 text-white"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                        }`}
                      >
                        {t("fileChanges.diff.unifiedView")}
                      </button>
                      <button
                        onClick={() => setDiffView("split")}
                        className={`px-2.5 py-1 text-xs font-medium ${
                          diffView === "split"
                            ? "bg-blue-500 text-white"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                        }`}
                      >
                        {t("fileChanges.diff.splitView")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    </div>
                  ) : error ? (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-sm text-red-500">{error}</p>
                    </div>
                  ) : viewMode === "diff" && diffData ? (
                    <div className="text-xs">
                      <ReactDiffViewer
                        oldValue={diffData.originalContent}
                        newValue={diffData.modifiedContent}
                        splitView={diffView === "split"}
                        compareMethod={DiffMethod.LINES}
                        useDarkTheme={isDark}
                        hideLineNumbers={false}
                        styles={{
                          diffContainer: {
                            fontSize: "12px",
                            fontFamily:
                              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                          },
                          line: {
                            fontSize: "12px",
                          },
                          gutter: {
                            fontSize: "12px",
                            minWidth: "40px",
                          },
                        }}
                      />
                    </div>
                  ) : viewMode === "file" && diffData ? (
                    <pre className="p-4 text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap overflow-auto">
                      {diffData.modifiedContent || diffData.originalContent}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-sm text-slate-400">
                        {t("fileChanges.diff.noDiff")}
                      </p>
                    </div>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
