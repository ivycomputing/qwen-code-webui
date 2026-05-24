import { useTranslation } from "react-i18next";
import { DocumentIcon, CodeBracketIcon } from "@heroicons/react/24/outline";
import type { FileChange } from "../../types/fileChanges";

interface FileChangesListProps {
  files: FileChange[];
  isLoading: boolean;
  error: string | null;
  onFileClick: (file: FileChange) => void;
}

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rs",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "html",
  "css",
  "scss",
  "json",
  "yaml",
  "yml",
  "toml",
  "md",
  "sh",
  "bash",
]);

function isCodeFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return CODE_EXTENSIONS.has(ext);
}

function FileIcon({ path }: { path: string }) {
  if (isCodeFile(path)) {
    return (
      <CodeBracketIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
    );
  }
  return (
    <DocumentIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
  );
}

function StatusBadge({ status }: { status: FileChange["status"] }) {
  const { t } = useTranslation();
  const styles = {
    modified:
      "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
    added:
      "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    deleted: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  };
  const labels = {
    modified: "M",
    added: "A",
    deleted: "D",
  };

  return (
    <span
      className={`text-xs font-mono px-1 py-0.5 rounded ${styles[status]}`}
      title={t(`fileChanges.status.${status}`)}
    >
      {labels[status]}
    </span>
  );
}

function truncatePath(path: string, maxLen: number = 40): string {
  if (path.length <= maxLen) return path;
  const fileName = path.split("/").pop() || path;
  if (fileName.length >= maxLen) return "..." + fileName.slice(-(maxLen - 3));
  const parts = path.split("/");
  const fileName2 = parts.pop()!;
  const remaining = maxLen - fileName2.length - 4;
  if (remaining > 0) {
    return "..." + path.slice(-(remaining + fileName2.length + 1));
  }
  return "..." + fileName2;
}

export function FileChangesList({
  files,
  isLoading,
  error,
  onFileClick,
}: FileChangesListProps) {
  const { t } = useTranslation();

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading && files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("fileChanges.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {t("fileChanges.noChanges")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {files.map((file) => (
        <button
          key={file.path}
          onClick={() => onFileClick(file)}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 border-b border-slate-100 dark:border-slate-800 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
          title={file.path}
        >
          <FileIcon path={file.path} />
          <StatusBadge status={file.status} />
          <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate font-mono">
            {truncatePath(file.path)}
          </span>
          <span className="text-xs font-mono flex-shrink-0 space-x-1">
            {file.additions > 0 && (
              <span className="text-green-600 dark:text-green-400">
                +{file.additions}
              </span>
            )}
            {file.deletions > 0 && (
              <span className="text-red-600 dark:text-red-400">
                -{file.deletions}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
