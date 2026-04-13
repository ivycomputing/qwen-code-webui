import { useState, useCallback } from "react";
import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  FolderIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { DirectoryBrowser } from "./DirectoryBrowser";
import {
  createOpenAceProject,
  checkPath,
  type OpenAceProject,
} from "../api/openace";

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectAdded: (project: OpenAceProject) => void;
}

type Step = "browse" | "details" | "creating" | "success" | "error";

export function AddProjectModal({
  isOpen,
  onClose,
  onProjectAdded,
}: AddProjectModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("browse");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [projectDescription, setProjectDescription] = useState<string>("");
  const [isShared, setIsShared] = useState(false);
  const [createDir, setCreateDir] = useState(true);
  const [pathExists, setPathExists] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [createdProject, setCreatedProject] = useState<OpenAceProject | null>(null);

  const resetState = useCallback(() => {
    setStep("browse");
    setSelectedPath("");
    setProjectName("");
    setProjectDescription("");
    setIsShared(false);
    setCreateDir(true);
    setPathExists(null);
    setErrorMessage("");
    setCreatedProject(null);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSelectDirectory = async (path: string) => {
    setSelectedPath(path);

    // Extract default name from path
    const segments = path.split(/[/\\]/).filter(Boolean);
    setProjectName(segments[segments.length - 1] || "");

    // Check if path exists
    try {
      const result = await checkPath(path);
      setPathExists(result.exists);

      if (!result.valid) {
        setErrorMessage(result.error || t("project.invalidPath"));
        return;
      }

      // Move to details step
      setStep("details");
    } catch {
      // Assume path might not exist, proceed anyway
      setPathExists(false);
      setStep("details");
    }
  };

  const handleCreateProject = async () => {
    setStep("creating");
    setErrorMessage("");

    try {
      const response = await createOpenAceProject({
        path: selectedPath,
        name: projectName || undefined,
        description: projectDescription || undefined,
        is_shared: isShared,
        create_dir: createDir && !pathExists,
      });

      setCreatedProject(response.project);
      setStep("success");

      // Notify parent
      onProjectAdded(response.project);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("project.failedToCreate"));
      setStep("error");
    }
  };

  const handleBack = () => {
    if (step === "details" || step === "error") {
      setStep("browse");
      setPathExists(null);
      setErrorMessage("");
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 dark:bg-black/50" style={{ pointerEvents: 'none' }} />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto" style={{ pointerEvents: 'none' }}>
          <div className="flex min-h-full items-center justify-center p-4" style={{ pointerEvents: 'none' }}>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel 
                className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 text-left align-middle shadow-xl transition-all"
                style={{ pointerEvents: 'auto' }}
                onKeyDown={(e) => {
                  // Handle Enter key for details step
                  if (e.key === "Enter" && step === "details") {
                    e.preventDefault();
                    handleCreateProject();
                  }
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {t("project.addNewProject")}
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <XMarkIcon className="h-5 w-5 text-slate-500" />
                  </button>
                </div>

                {/* Content based on step */}
                {step === "browse" && (
                  <div 
                    className="p-4"
                    style={{ pointerEvents: 'auto' }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        // Enter in browse step does nothing - let DirectoryBrowser handle it
                      }
                    }}
                  >
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      {t("project.selectDirectory")}
                    </p>
                    <DirectoryBrowser
                      onSelectDirectory={handleSelectDirectory}
                      onClose={handleClose}
                    />
                  </div>
                )}

                {step === "details" && (
                  <div className="p-6 space-y-4" style={{ pointerEvents: 'auto' }}>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t("project.projectPath")}
                      </label>
                      <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                        <FolderIcon className="h-5 w-5 text-yellow-500" />
                        <span className="text-slate-700 dark:text-slate-200 font-mono text-sm">
                          {selectedPath}
                        </span>
                        {pathExists === false && (
                          <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                            {t("project.willBeCreated")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t("project.projectName")}
                      </label>
                      <input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder={t("project.projectNamePlaceholder")}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t("project.description")}
                      </label>
                      <textarea
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        placeholder={t("project.descriptionPlaceholder")}
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        onKeyDown={(e) => {
                          // Allow Enter with Ctrl/Cmd to submit
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleCreateProject();
                          }
                        }}
                      />
                    </div>

                    {!pathExists && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="createDir"
                          checked={createDir}
                          onChange={(e) => setCreateDir(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600"
                        />
                        <label
                          htmlFor="createDir"
                          className="text-sm text-slate-700 dark:text-slate-300"
                        >
                          {t("project.createDirectory")}
                        </label>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isShared"
                        checked={isShared}
                        onChange={(e) => setIsShared(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                      <label
                        htmlFor="isShared"
                        className="text-sm text-slate-700 dark:text-slate-300"
                      >
                        {t("project.sharedProject")}
                      </label>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={handleBack}
                        className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      >
                        {t("common.back")}
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateProject}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                      >
                        {t("project.addProject")}
                      </button>
                    </div>
                  </div>
                )}

                {step === "creating" && (
                  <div className="flex flex-col items-center justify-center p-12">
                    <svg
                      className="animate-spin h-10 w-10 text-blue-600 mb-4"
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
                    <p className="text-slate-600 dark:text-slate-400">{t("project.creating")}</p>
                  </div>
                )}

                {step === "success" && createdProject && (
                  <div
                    className="flex flex-col items-center justify-center p-12"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleClose();
                      }
                    }}
                    tabIndex={0}
                    ref={(el) => el?.focus()}
                  >
                    <CheckCircleIcon className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                      {t("project.created")}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 text-center mb-4">
                      {createdProject.name || createdProject.path}
                    </p>
                    <button
                      onClick={handleClose}
                      autoFocus
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                    >
                      {t("common.done")}
                    </button>
                  </div>
                )}

                {step === "error" && (
                  <div className="p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <ExclamationCircleIcon className="h-6 w-6 text-red-500 flex-shrink-0" />
                      <div>
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                          {t("project.failedToCreate")}
                        </h3>
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          {errorMessage}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={handleBack}
                        className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      >
                        {t("project.tryAgain")}
                      </button>
                      <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}