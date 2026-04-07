import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { ProjectsResponse, ProjectInfo } from "../types";
import { getProjectsUrl } from "../config/api";
import { SettingsButton } from "./SettingsButton";
import { SettingsModal } from "./SettingsModal";
import { AddProjectModal } from "./AddProjectModal";
import { ConfirmModal } from "./ConfirmModal";
import {
  isIntegratedMode,
  fetchOpenAceProjects,
  deleteOpenAceProject,
  deleteLocalProject,
  type OpenAceProject,
} from "../api/openace";

const LAST_PROJECT_KEY = "qwen-code-last-project";

/**
 * Sort projects by hierarchy (parent directories first) and alphabetically
 * - Parent directories come before their children
 * - Sibling directories are sorted alphabetically (case-insensitive)
 */
function sortProjects(projects: ProjectInfo[]): ProjectInfo[] {
  return [...projects].sort((a, b) => {
    const aParts = a.path.split("/").filter(Boolean);
    const bParts = b.path.split("/").filter(Boolean);

    const minLen = Math.min(aParts.length, bParts.length);
    for (let i = 0; i < minLen; i++) {
      if (aParts[i] !== bParts[i]) {
        return aParts[i].localeCompare(bParts[i], undefined, { sensitivity: "base" });
      }
    }

    return aParts.length - bParts.length;
  });
}

/**
 * Convert Open-ACE project to local ProjectInfo format
 */
function openAceProjectToLocal(project: OpenAceProject): ProjectInfo {
  // Extract encoded name from path (same encoding as qwen-code-webui)
  const encodedName = project.path
    .replace(/^[A-Za-z]:/, "") // Remove Windows drive letter
    .replace(/^\/+/, "") // Remove leading slashes
    .replace(/[^a-zA-Z0-9]/g, "-"); // Replace non-alphanumeric with dash

  return {
    path: project.path,
    encodedName: "-" + encodedName,
  };
}

export function ProjectSelector() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [openAceProjects, setOpenAceProjects] = useState<OpenAceProject[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [deleteProject, setDeleteProject] = useState<OpenAceProject | ProjectInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  // Ref for the project list container to enable keyboard focus
  const projectListRef = useRef<HTMLDivElement>(null);

  const integrated = isIntegratedMode();

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (integrated) {
        // Load from Open-ACE
        const response = await fetchOpenAceProjects();
        const aceProjects = response.projects || [];
        setOpenAceProjects(aceProjects);
        
        // Convert to local format
        const localProjects = aceProjects.map(openAceProjectToLocal);
        setProjects(sortProjects(localProjects));
      } else {
        // Load from local API
        const response = await fetch(getProjectsUrl());
        if (!response.ok) {
          throw new Error(`Failed to load projects: ${response.statusText}`);
        }
        const data: ProjectsResponse = await response.json();
        setProjects(sortProjects(data.projects));
        setOpenAceProjects([]);
      }

      // Set default selection to most recently used project
      if (projects.length > 0) {
        const lastProject = localStorage.getItem(LAST_PROJECT_KEY);
        if (lastProject) {
          const lastIndex = projects.findIndex((p) => p.path === lastProject);
          if (lastIndex !== -1) {
            setSelectedIndex(lastIndex);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [integrated]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleProjectSelect = useCallback((projectPath: string) => {
    localStorage.setItem(LAST_PROJECT_KEY, projectPath);

    const normalizedPath = projectPath.startsWith("/")
      ? projectPath
      : `/${projectPath}`;
    navigate(`/projects${normalizedPath}`);
  }, [navigate]);

  // Auto-focus the project list container when loaded to enable keyboard navigation
  // This allows users to use arrow keys immediately without clicking
  useEffect(() => {
    if (!loading && projects.length > 0 && projectListRef.current) {
      // Use setTimeout to ensure the DOM is ready
      const timer = setTimeout(() => {
        projectListRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, projects.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard events if modals are open
      if (isSettingsOpen || isAddProjectOpen || deleteProject !== null) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % projects.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + projects.length) % projects.length);
      } else if (e.key === "Enter" && projects.length > 0) {
        e.preventDefault();
        const selectedProject = projects[selectedIndex];
        if (selectedProject) {
          handleProjectSelect(selectedProject.path);
        }
      }
    };

    if (projects.length > 0) {
      // Use projectListRef for keyboard events instead of window
      // This ensures keyboard events are captured when the container is focused
      const container = projectListRef.current;
      if (container) {
        container.addEventListener("keydown", handleKeyDown);
        return () => container.removeEventListener("keydown", handleKeyDown);
      }
      // Fallback to window if container is not available yet
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [projects, selectedIndex, isSettingsOpen, isAddProjectOpen, deleteProject, handleProjectSelect]);

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  const handleAddProject = () => {
    setIsAddProjectOpen(true);
  };

  const handleProjectAdded = () => {
    // Reload projects
    loadProjects();
    setIsAddProjectOpen(false);
  };

  const handleDeleteClick = (project: ProjectInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteProject(project);
  };

  const handleConfirmDelete = async () => {
    if (!deleteProject) return;

    setIsDeleting(true);
    try {
      if (integrated) {
        // Open-ACE mode - use project id
        const aceProject = deleteProject as OpenAceProject;
        await deleteOpenAceProject(aceProject.id);
      } else {
        // Local mode - use encoded name
        const localProject = deleteProject as ProjectInfo;
        await deleteLocalProject(localProject.encodedName);
      }
      // Reload projects
      await loadProjects();
      setDeleteProject(null);
    } catch (err) {
      console.error("Failed to delete project:", err);
      // Show error - could add a toast notification here
    } finally {
      setIsDeleting(false);
    }
  };

  // Get display name for Open-ACE project
  const getProjectDisplayName = (project: ProjectInfo): string => {
    if (!integrated) return project.path;

    const aceProject = openAceProjects.find((p) => p.path === project.path);
    if (aceProject?.name) return aceProject.name;

    // Extract last segment of path
    return project.path.split(/[/\\]/).filter(Boolean).pop() || project.path;
  };

  // Get display name for delete confirmation
  const getDeleteConfirmName = (project: OpenAceProject | ProjectInfo): string => {
    if (integrated && 'name' in project && project.name) {
      return project.name;
    }
    return project.path;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-600 dark:text-slate-400">
          {t("projectSelector.loadingProjects")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-red-600 dark:text-red-400">{t("common.error")}: {error}</div>
        <button
          onClick={loadProjects}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          <ArrowPathIcon className="h-4 w-4" />
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-slate-800 dark:text-slate-100 text-3xl font-bold tracking-tight">
            {t("projectSelector.title")}
          </h1>
          <div className="flex items-center gap-2">
            {integrated && (
              <button
                onClick={handleAddProject}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <PlusIcon className="h-4 w-4" />
                {t("project.addProject")}
              </button>
            )}
            <SettingsButton onClick={handleSettingsClick} />
          </div>
        </div>

        {/* Project list container with tabIndex for keyboard focus */}
        <div
          ref={projectListRef}
          tabIndex={0}
          className="space-y-3 outline-none"
        >
          {projects.length > 0 ? (
            <>
              {/* Keyboard navigation hint */}
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-3">
                <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 rounded">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 rounded">↓</kbd>
                <span>{t("projectSelector.navigate") || "Navigate"}</span>
                <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 rounded ml-2">Enter</kbd>
                <span>{t("projectSelector.select") || "Select"}</span>
              </div>
              {projects.map((project, index) => {
                const aceProject = openAceProjects.find((p) => p.path === project.path);
                const displayName = getProjectDisplayName(project);
                
                return (
                  <div
                    key={project.path}
                    className={`flex items-center gap-3 p-4 border rounded-lg transition-colors cursor-pointer ${
                      index === selectedIndex
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-500"
                        : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                    }`}
                    onClick={() => {
                      setSelectedIndex(index);
                      handleProjectSelect(project.path);
                    }}
                  >
                    <FolderIcon
                      className={`h-5 w-5 flex-shrink-0 ${
                        index === selectedIndex
                          ? "text-blue-500 dark:text-blue-400"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-mono text-sm truncate ${
                          index === selectedIndex
                            ? "text-blue-800 dark:text-blue-200 font-semibold"
                            : "text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {displayName}
                      </div>
                      {integrated && aceProject?.name && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {project.path}
                        </div>
                      )}
                    </div>

                    {/* Delete button - shows for both integrated and local modes */}
                    <button
                      onClick={(e) => handleDeleteClick(project, e)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title={integrated ? "Remove project" : t("projectSelector.removeProject") || "Remove project"}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>

                    {index === selectedIndex && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {t("projectSelector.pressEnter")}
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <FolderIcon className="h-16 w-16 text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                {t("projectSelector.noProjects")}
              </p>
              {integrated && (
                <button
                  onClick={handleAddProject}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <PlusIcon className="h-4 w-4" />
                  {t("projectSelector.addFirstProject")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Settings Modal */}
        <SettingsModal isOpen={isSettingsOpen} onClose={handleSettingsClose} />

        {/* Add Project Modal */}
        <AddProjectModal
          isOpen={isAddProjectOpen}
          onClose={() => setIsAddProjectOpen(false)}
          onProjectAdded={handleProjectAdded}
        />

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          isOpen={deleteProject !== null}
          onClose={() => setDeleteProject(null)}
          onConfirm={handleConfirmDelete}
          title={t("projectSelector.removeProject")}
          message={t("projectSelector.removeConfirmMessage", { 
            name: deleteProject ? getDeleteConfirmName(deleteProject) : ''
          })}
          confirmText={t("projectSelector.remove")}
          variant="danger"
          isLoading={isDeleting}
        />
      </div>
    </div>
  );
}