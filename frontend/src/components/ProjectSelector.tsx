import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FolderIcon } from "@heroicons/react/24/outline";
import type { ProjectsResponse, ProjectInfo } from "../types";
import { getProjectsUrl } from "../config/api";
import { SettingsButton } from "./SettingsButton";
import { SettingsModal } from "./SettingsModal";

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

    // Compare path segments one by one
    const minLen = Math.min(aParts.length, bParts.length);
    for (let i = 0; i < minLen; i++) {
      if (aParts[i] !== bParts[i]) {
        // Different parent at this level, sort alphabetically
        return aParts[i].localeCompare(bParts[i], undefined, { sensitivity: "base" });
      }
    }

    // If all compared segments are equal, shorter path (parent) comes first
    return aParts.length - bParts.length;
  });
}

export function ProjectSelector() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [projects, selectedIndex]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch(getProjectsUrl());
      if (!response.ok) {
        throw new Error(`Failed to load projects: ${response.statusText}`);
      }
      const data: ProjectsResponse = await response.json();
      // Sort projects: parent directories first, then alphabetically
      const sortedProjects = sortProjects(data.projects);
      setProjects(sortedProjects);

      // Set default selection to most recently used project
      if (sortedProjects.length > 0) {
        const lastProject = localStorage.getItem(LAST_PROJECT_KEY);
        if (lastProject) {
          const lastIndex = sortedProjects.findIndex((p) => p.path === lastProject);
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
  };

  const handleProjectSelect = useCallback((projectPath: string) => {
    // Save to localStorage for next time
    localStorage.setItem(LAST_PROJECT_KEY, projectPath);
    
    const normalizedPath = projectPath.startsWith("/")
      ? projectPath
      : `/${projectPath}`;
    navigate(`/projects${normalizedPath}`);
  }, [navigate]);

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-600 dark:text-slate-400">
          Loading projects...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-slate-800 dark:text-slate-100 text-3xl font-bold tracking-tight">
            Select a Project
          </h1>
          <SettingsButton onClick={handleSettingsClick} />
        </div>

        <div className="space-y-3">
          {projects.length > 0 && (
            <>
              <h2 className="text-slate-700 dark:text-slate-300 text-lg font-medium mb-4">
                Recent Projects
              </h2>
              {projects.map((project, index) => (
                <button
                  key={project.path}
                  onClick={() => {
                    setSelectedIndex(index);
                    handleProjectSelect(project.path);
                  }}
                  className={`w-full flex items-center gap-3 p-4 border rounded-lg transition-colors text-left ${
                    index === selectedIndex
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-500"
                      : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <FolderIcon className={`h-5 w-5 flex-shrink-0 ${
                    index === selectedIndex
                      ? "text-blue-500 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400"
                  }`} />
                  <span className={`font-mono text-sm flex-1 ${
                    index === selectedIndex
                      ? "text-blue-800 dark:text-blue-200 font-semibold"
                      : "text-slate-800 dark:text-slate-200"
                  }`}>
                    {project.path}
                  </span>
                  {index === selectedIndex && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Press Enter
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Settings Modal */}
        <SettingsModal isOpen={isSettingsOpen} onClose={handleSettingsClose} />
      </div>
    </div>
  );
}
