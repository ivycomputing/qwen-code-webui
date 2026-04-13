/**
 * Open-ACE API client
 *
 * Used for project management and file system browsing when integrated with Open-ACE.
 * Falls back to local qwen-code-webui API when not integrated.
 */

import { getToken, getOpenAceUrl } from "../utils/token";

// Open-ACE API base URL - can be configured via environment or detected from URL
const getOpenAceBaseUrl = (): string => {
  // First check if openace_url was explicitly provided in URL parameters
  const explicitOpenAceUrl = getOpenAceUrl();
  if (explicitOpenAceUrl) {
    return explicitOpenAceUrl;
  }

  // When running inside Open-ACE iframe, we need to call Open-ACE APIs
  // The parent window's origin is Open-ACE
  const token = getToken();
  if (token) {
    // Integrated mode - we need to determine Open-ACE's origin
    // In production, Open-ACE proxies requests to qwen-code-webui
    // But for project management, we need to call Open-ACE APIs
    try {
      // If we're in an iframe, try to get parent origin
      if (window.parent !== window) {
        // We're in an iframe - the parent is Open-ACE
        // Use the parent's origin for API calls
        return window.parent.location.origin;
      }
    } catch {
      // Cross-origin iframe, can't access parent location directly
      // Use document.referrer as fallback to get parent's origin
      if (document.referrer) {
        try {
          const referrerUrl = new URL(document.referrer);
          return referrerUrl.origin;
        } catch {
          // Invalid referrer URL
        }
      }
    }
  }

  // Standalone mode - no Open-ACE integration
  // Return empty string to use relative paths
  return "";
};

/**
 * Build full URL for Open-ACE API
 */
const buildOpenAceUrl = (endpoint: string): string => {
  const baseUrl = getOpenAceBaseUrl();
  const token = getToken();
  
  let url = baseUrl + endpoint;
  if (token) {
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}token=${encodeURIComponent(token)}`;
  }
  return url;
};

/**
 * Project info from Open-ACE
 */
export interface OpenAceProject {
  id: number;
  path: string;
  name: string | null;
  description: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_shared: boolean;
}

export interface OpenAceProjectsResponse {
  success: boolean;
  projects: OpenAceProject[];
}

export interface CreateProjectRequest {
  path: string;
  name?: string;
  description?: string;
  is_shared?: boolean;
  create_dir?: boolean;
}

export interface CreateProjectResponse {
  success: boolean;
  project: OpenAceProject;
  dir_created?: boolean;
}

/**
 * Directory info from Open-ACE file system browse
 */
export interface DirectoryInfo {
  name: string;
  path: string;
  isReadable: boolean;
  isWritable: boolean;
}

export interface BrowseResponse {
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryInfo[];
  homePath: string;
  canCreate: boolean;
  error?: string;
  fallback?: BrowseResponse;
}

export interface CheckPathResponse {
  valid: boolean;
  exists: boolean;
  canWrite?: boolean;
  canCreate?: boolean;
  error?: string;
}

/**
 * Fetch projects from Open-ACE
 */
export async function fetchOpenAceProjects(): Promise<OpenAceProjectsResponse> {
  const url = buildOpenAceUrl("/api/projects");
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Create a new project in Open-ACE
 */
export async function createOpenAceProject(
  request: CreateProjectRequest
): Promise<CreateProjectResponse> {
  const url = buildOpenAceUrl("/api/projects");
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to create project: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Delete a project from Open-ACE
 */
export async function deleteOpenAceProject(projectId: number): Promise<{ success: boolean }> {
  const url = buildOpenAceUrl(`/api/projects/${projectId}`);
  
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to delete project: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Browse directory via Open-ACE
 */
export async function browseDirectory(path?: string): Promise<BrowseResponse> {
  let url = buildOpenAceUrl("/api/fs/browse");
  if (path) {
    url = `${url}&path=${encodeURIComponent(path)}`;
  }
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to browse directory: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Check if a path is valid for project creation
 */
export async function checkPath(path: string): Promise<CheckPathResponse> {
  const url = buildOpenAceUrl("/api/fs/check-path");
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    return {
      valid: false,
      exists: false,
      error: error.error || "Failed to check path",
    };
  }
  
  return response.json();
}

/**
 * Get home directory from Open-ACE
 */
export async function getHomeDirectory(): Promise<{ homePath: string; canCreate: boolean }> {
  const url = buildOpenAceUrl("/api/fs/home");
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get home directory: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Check if running in Open-ACE integrated mode
 */
export function isIntegratedMode(): boolean {
  return getToken() !== undefined;
}

/**
 * Delete a local project (non-Open-ACE mode)
 * Calls DELETE /api/projects/:encodedProjectName
 */
export async function deleteLocalProject(encodedProjectName: string): Promise<{ success: boolean; message: string }> {
  const url = `/api/projects/${encodeURIComponent(encodedProjectName)}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to delete project: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get Open-ACE session API URL for tracking work duration
 */
export function getOpenAceSessionApi(): string {
  return buildOpenAceUrl("/api/workspace/sessions");
}

/**
 * Update session statistics (tokens, message count, etc.)
 * Called during conversation to sync usage stats for session list display.
 */
export async function updateSessionStats(
  sessionId: string,
  stats: {
    total_tokens?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
    message_count?: number;
    request_count?: number;
    model?: string;
  }
): Promise<{ success: boolean }> {
  const url = `${getOpenAceSessionApi()}/${sessionId}/stats`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stats),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to update session stats: ${response.statusText}`);
  }

  return response.json();
}