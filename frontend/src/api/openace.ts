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
 * @param sessionId - Optional session ID to append to the URL
 * @param action - Optional action to append (e.g., 'stats', 'complete')
 */
export function getOpenAceSessionApi(sessionId?: string, action?: string): string {
  let endpoint = "/api/workspace/sessions";
  if (sessionId) {
    endpoint += `/${sessionId}`;
  }
  if (action) {
    endpoint += `/${action}`;
  }
  return buildOpenAceUrl(endpoint);
}

// -------------------------------------------------------
// Remote Machine & Workspace types
// -------------------------------------------------------

export interface RemoteMachine {
  machine_id: string;
  machine_name: string;
  hostname: string | null;
  os_type: string | null;
  os_version: string | null;
  status: "online" | "offline" | "busy" | "error";
  capabilities: Record<string, any>;
  connected: boolean;
  last_heartbeat: string | null;
}

export interface RemoteSessionOutput {
  session_id: string;
  data: string;
  stream: string;
  is_complete: boolean;
  timestamp: string;
}

export interface RemoteSession {
  session_id: string;
  machine_id: string;
  status: string;
  project_path: string;
  cli_tool: string;
  model: string | null;
  output: RemoteSessionOutput[];
  created_at: string | null;
}

// -------------------------------------------------------
// Remote Workspace API functions
// -------------------------------------------------------

/**
 * Fetch available remote machines
 */
export async function fetchRemoteMachines(): Promise<{ success: boolean; machines: RemoteMachine[] }> {
  const url = buildOpenAceUrl("/api/remote/machines/available");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch remote machines: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Create a new remote session on a machine
 */
export async function createRemoteSession(
  machineId: string,
  projectPath: string,
  model?: string,
  cliTool?: string,
  permissionMode?: string
): Promise<{ success: boolean; session: RemoteSession }> {
  const url = buildOpenAceUrl("/api/remote/sessions");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      machine_id: machineId,
      project_path: projectPath,
      model: model || undefined,
      cli_tool: cliTool || undefined,
      permission_mode: permissionMode || undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to create remote session: ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Send a chat message to a remote session
 */
export async function sendRemoteMessage(
  sessionId: string,
  content: string,
  permissionMode?: string
): Promise<{ success: boolean }> {
  const url = buildOpenAceUrl(`/api/remote/sessions/${sessionId}/chat`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
      permission_mode: permissionMode || undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // Enrich error with status for quota detection
    const httpError: Error & { status?: number; quotaStatus?: unknown } = new Error(
      error.error || `Failed to send remote message: ${response.statusText}`
    );
    httpError.status = response.status;
    if (error.error === "quota_exceeded") {
      httpError.quotaStatus = error.quota_status;
    }
    throw httpError;
  }

  return response.json();
}

/**
 * Switch the model of an active remote session
 */
export async function switchRemoteModel(
  sessionId: string,
  model: string
): Promise<{ success: boolean }> {
  const url = buildOpenAceUrl(`/api/remote/sessions/${sessionId}/model`);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to switch model: ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Get the current status / output of a remote session
 */
export async function getRemoteSessionStatus(
  sessionId: string
): Promise<{ success: boolean; session: RemoteSession }> {
  const url = buildOpenAceUrl(`/api/remote/sessions/${sessionId}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get remote session status: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Abort the current in-progress request without stopping the session
 */
export async function abortRemoteRequest(
  sessionId: string
): Promise<{ success: boolean }> {
  const url = buildOpenAceUrl(`/api/remote/sessions/${sessionId}/abort`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to abort remote request: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Stop a remote session
 */
export async function stopRemoteSession(
  sessionId: string
): Promise<{ success: boolean }> {
  const url = buildOpenAceUrl(`/api/remote/sessions/${sessionId}/stop`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to stop remote session: ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Browse directories on a remote machine
 */
export async function browseRemoteDirectory(
  machineId: string,
  path?: string
): Promise<BrowseResponse> {
  let url = buildOpenAceUrl(`/api/remote/machines/${machineId}/browse`);
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
    throw new Error(`Failed to browse remote directory: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Open an SSE connection to stream remote session output.
 * The server sends lines in the same claude_json format used by local sessions.
 */
/**
 * Send a permission response (approve/deny) to the remote agent
 */
export async function sendPermissionResponse(
  sessionId: string,
  requestId: string,
  behavior: "allow" | "allow-permanent" | "deny",
  message?: string,
  toolName?: string
): Promise<{ success: boolean }> {
  const url = buildOpenAceUrl(`/api/remote/sessions/${sessionId}/permission`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      request_id: requestId,
      behavior,
      tool_name: toolName || "",
      ...(message ? { message } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to send permission response: ${response.statusText}`
    );
  }

  return response.json();
}

export function createRemoteSessionStream(
  sessionId: string,
  onLine: (line: string) => void,
  onError: (err: Event) => void,
  onDone: () => void,
): EventSource {
  const url = buildOpenAceUrl(`/api/remote/sessions/${sessionId}/stream`);
  console.log("[SSE] Connecting to:", url);
  const es = new EventSource(url);
  es.onopen = () => {
    console.log("[SSE] Connection opened");
  };
  es.onmessage = (event) => {
    if (event.data === "[DONE]") {
      console.log("[SSE] Received [DONE]");
      es.close();
      onDone();
      return;
    }
    onLine(event.data);
  };
  es.onerror = (e) => {
    console.error("[SSE] Error, readyState:", es.readyState, e);
    es.close();
    onError(e);
  };
  return es;
}

