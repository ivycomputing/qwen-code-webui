/**
 * Token utility for Open-ACE integration
 *
 * When webui is launched by Open-ACE with --token-secret,
 * the URL contains a ?token=xxx query parameter.
 * This utility extracts and provides the token for API requests.
 *
 * The token is saved to sessionStorage on initial load to persist
 * across SPA navigation.
 */

const TOKEN_STORAGE_KEY = "qwen-webui-token";
const OPENACE_URL_STORAGE_KEY = "qwen-webui-openace-url";

/**
 * Save token and openace_url to sessionStorage if present in URL
 * Should be called once on app initialization
 */
export function initTokenFromUrl(): void {
  const searchParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = searchParams.get("token");
  const openaceUrlFromUrl = searchParams.get("openace_url");

  if (tokenFromUrl) {
    // Save token to sessionStorage for persistence across SPA navigation
    sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenFromUrl);
    console.log("[Token] Token saved from URL");
  }

  if (openaceUrlFromUrl) {
    // Save openace_url to sessionStorage for API calls
    sessionStorage.setItem(OPENACE_URL_STORAGE_KEY, openaceUrlFromUrl);
    console.log("[Token] Open-ACE URL saved from URL:", openaceUrlFromUrl);
  }
}

/**
 * Get the token from sessionStorage or URL query parameter
 * Returns undefined if no token is present (standalone mode)
 */
export function getToken(): string | undefined {
  // First check sessionStorage (persisted from initial URL)
  const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (storedToken) {
    return storedToken;
  }

  // Fallback to URL query parameter (for initial page load)
  const searchParams = new URLSearchParams(window.location.search);
  const urlToken = searchParams.get("token");
  return urlToken || undefined;
}

/**
 * Get the Open-ACE API URL from sessionStorage or URL query parameter
 * Returns undefined if no openace_url is present (standalone mode)
 */
export function getOpenAceUrl(): string | undefined {
  // First check sessionStorage (persisted from initial URL)
  const storedUrl = sessionStorage.getItem(OPENACE_URL_STORAGE_KEY);
  if (storedUrl) {
    return storedUrl;
  }

  // Fallback to URL query parameter (for initial page load)
  const searchParams = new URLSearchParams(window.location.search);
  const urlOpenace = searchParams.get("openace_url");
  return urlOpenace || undefined;
}

/**
 * Add token to an API URL if present
 *
 * @param url The API URL
 * @returns URL with token query parameter if token exists, otherwise original URL
 */
export function addTokenToUrl(url: string): string {
  const token = getToken();
  if (!token) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Clear the stored token and openace_url (for logout or session end)
 */
export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(OPENACE_URL_STORAGE_KEY);
}