import { useState, useCallback, useEffect } from "react";
import { FileChangesHeader } from "./FileChangesHeader";
import { FileChangesList } from "./FileChangesList";
import { VSCodeEditor } from "./VSCodeEditor";
import { useFileChanges } from "../../hooks/useFileChanges";
import { useVSCode } from "../../hooks/useVSCode";
import type { FileChange } from "../../types/fileChanges";

interface FileChangesPanelProps {
  workingDirectory: string | undefined;
  onOpenDiff: (file: FileChange) => void;
  onClose: () => void;
  onVSCodeOpenChange?: (isOpen: boolean) => void;
}

export function FileChangesPanel({
  workingDirectory,
  onOpenDiff,
  onClose,
  onVSCodeOpenChange,
}: FileChangesPanelProps) {
  const { files, isLoading, error, refresh } = useFileChanges(workingDirectory);
  const vscode = useVSCode();
  const [showVSCode, setShowVSCode] = useState(false);

  const handleToggleVSCode = useCallback(async () => {
    if (showVSCode) {
      await vscode.stop();
      setShowVSCode(false);
    } else if (workingDirectory) {
      setShowVSCode(true);
      await vscode.start(workingDirectory);
    }
  }, [showVSCode, workingDirectory, vscode]);

  const handleCloseVSCode = useCallback(async () => {
    await vscode.stop();
    setShowVSCode(false);
  }, [vscode]);

  useEffect(() => {
    onVSCodeOpenChange?.(showVSCode);
    return () => onVSCodeOpenChange?.(false);
  }, [onVSCodeOpenChange, showVSCode]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700">
      <FileChangesHeader
        fileCount={files.length}
        isLoading={isLoading}
        vscodeRunning={showVSCode && vscode.isRunning}
        onRefresh={refresh}
        onToggleVSCode={handleToggleVSCode}
        onClose={onClose}
      />
      {showVSCode ? (
        <VSCodeEditor
          url={vscode.url}
          isLoading={vscode.isLoading}
          error={vscode.error}
          onClose={handleCloseVSCode}
        />
      ) : (
        <FileChangesList
          files={files}
          isLoading={isLoading}
          error={error}
          onFileClick={onOpenDiff}
        />
      )}
    </div>
  );
}
