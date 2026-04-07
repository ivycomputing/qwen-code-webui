// API configuration - uses relative paths with Vite proxy in development
import { addTokenToUrl } from "../utils/token";

export const API_CONFIG = {
  ENDPOINTS: {
    VERSION: "/api/version",
    CHAT: "/api/chat",
    ABORT: "/api/abort",
    PROJECTS: "/api/projects",
    HISTORIES: "/api/projects",
    CONVERSATIONS: "/api/projects",
    MODELS: "/api/models",
  },
} as const;

// Helper function to get full API URL
export const getApiUrl = (endpoint: string) => {
  return addTokenToUrl(endpoint);
};

// Helper function to get abort URL
export const getAbortUrl = (requestId: string) => {
  return addTokenToUrl(`${API_CONFIG.ENDPOINTS.ABORT}/${requestId}`);
};

// Helper function to get chat URL
export const getChatUrl = () => {
  return addTokenToUrl(API_CONFIG.ENDPOINTS.CHAT);
};

// Helper function to get projects URL
export const getProjectsUrl = () => {
  return addTokenToUrl(API_CONFIG.ENDPOINTS.PROJECTS);
};

// Helper function to get histories URL
export const getHistoriesUrl = (projectPath: string) => {
  const encodedPath = encodeURIComponent(projectPath);
  return addTokenToUrl(
    `${API_CONFIG.ENDPOINTS.HISTORIES}/${encodedPath}/histories`
  );
};

// Helper function to get conversation URL
export const getConversationUrl = (
  encodedProjectName: string,
  sessionId: string,
  toolName?: string
) => {
  let url = `${API_CONFIG.ENDPOINTS.CONVERSATIONS}/${encodedProjectName}/histories/${sessionId}`;
  if (toolName) {
    url = `${url}?toolName=${encodeURIComponent(toolName)}`;
    return addTokenToUrl(url);
  }
  return addTokenToUrl(url);
};

// Helper function to get models URL
export const getModelsUrl = () => {
  return addTokenToUrl(API_CONFIG.ENDPOINTS.MODELS);
};

// Helper function to get version URL
export const getVersionUrl = () => {
  return addTokenToUrl(API_CONFIG.ENDPOINTS.VERSION);
};