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
 * Replace or add token parameter in a URL
 * Useful for SSE reconnection with refreshed token
 */
export function replaceTokenInUrl(url: string, newToken: string): string {
  try {
    const urlObj = new URL(url, window.location.origin);
    urlObj.searchParams.set('token', newToken);
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return original URL
    return url;
  }
}

/**
 * Clear the stored token and openace_url (for logout or session end)
 */
export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(OPENACE_URL_STORAGE_KEY);
}

/**
 * Update the stored token (called from parent window via postMessage)
 */
export function setToken(newToken: string): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, newToken);
  console.log("[Token] Token updated from parent window");
}

// Emit the "could not resolve parent origin" warning at most once per session so
// a genuine misconfiguration is diagnosable without spamming the console on every
// message.
let hasWarnedUnresolvedOrigin = false;

/**
 * Get the allowed origin for postMessage communication.
 *
 * Resolves the Open-ACE parent origin from (in order) the `openace_url` URL
 * param, the parent window's origin (same-origin iframes), or the referrer.
 * Exported so every `window.parent.postMessage` call site can target this
 * specific origin instead of the wildcard "*", which would leak message data to
 * any parent frame (CodeQL js/cross-window-information-leak).
 *
 * Always returns a valid postMessage targetOrigin: a concrete "scheme://host"
 * origin, or "/" (deliver only to the sender's own origin) when none can be
 * resolved. It never returns "" or the opaque "null", either of which would make
 * postMessage throw. When embedded but the parent origin cannot be determined
 * (cross-origin parent, no `openace_url`, no referrer), delivery is restricted to
 * the app's own origin and a one-time warning is logged — so Open-ACE should
 * always launch the iframe with the `openace_url` parameter.
 */
export function getAllowedOrigin(): string {
  // A usable targetOrigin must be a real origin — not empty and not the opaque
  // "null" (a sandboxed/opaque-origin document), which makes postMessage throw.
  const isUsableOrigin = (origin: string): boolean =>
    origin !== "" && origin !== "null";

  // First try openace_url parameter if available
  const openaceUrl = getOpenAceUrl();
  if (openaceUrl) {
    try {
      const origin = new URL(openaceUrl).origin;
      if (isUsableOrigin(origin)) return origin;
    } catch {
      // Invalid URL, fall through
    }
  }

  // Try to get parent origin (will work for same-origin iframes)
  if (window.parent !== window) {
    try {
      const origin = window.parent.location.origin;
      if (isUsableOrigin(origin)) return origin;
    } catch {
      // Cross-origin iframe - try referrer
      if (document.referrer) {
        try {
          const origin = new URL(document.referrer).origin;
          if (isUsableOrigin(origin)) return origin;
        } catch {
          // Invalid referrer
        }
      }
    }
  }

  // Could not resolve a definitive parent origin. Restrict delivery to our own
  // origin (or "/" if that is itself opaque) instead of broadcasting to "*".
  const ownOrigin = window.location.origin;
  if (window.parent !== window && !hasWarnedUnresolvedOrigin) {
    hasWarnedUnresolvedOrigin = true;
    console.warn(
      "[Token] Could not resolve the parent window origin for postMessage; " +
        "restricting messages to the app's own origin. Ensure Open-ACE launches " +
        "the iframe with the openace_url parameter."
    );
  }
  return isUsableOrigin(ownOrigin) ? ownOrigin : "/";
}

/**
 * Notify parent window about 401 error (token expired)
 * Parent will refresh token and send back new token
 */
export function notifyTokenExpired(): void {
  if (window.parent !== window) {
    const targetOrigin = getAllowedOrigin();
    console.log("[Token] Notifying parent about token expiration");
    window.parent.postMessage({ type: 'qwen-code-token-expired' }, targetOrigin);
  }
}

// Shared state for token refresh waiting (used by both API and SSE)
let isTokenRefreshPending = false;
let refreshWaiters: Array<() => void> = [];

/**
 * Notify parent about token expiration and wait for refresh
 * This function is shared between API requests and SSE to prevent duplicate notifications
 */
export function notifyAndWaitForTokenRefresh(): Promise<void> {
  if (!isTokenRefreshPending) {
    isTokenRefreshPending = true;
    notifyTokenExpired();
  }

  return new Promise((resolve) => {
    refreshWaiters.push(resolve);

    // Timeout after 10 seconds
    setTimeout(() => {
      const index = refreshWaiters.indexOf(resolve);
      if (index !== -1) {
        // Still pending → the parent never responded within 10s. Remove this
        // waiter and, if no others remain, clear the pending flag so the next
        // 401 re-notifies the parent. Without this reset, a non-responding
        // parent would leave isTokenRefreshPending=true forever, so the parent
        // is never re-notified and the request loops: 401 → wait 10s → retry
        // with the stale token → 401 → ...
        refreshWaiters.splice(index, 1);
        if (refreshWaiters.length === 0) {
          isTokenRefreshPending = false;
        }
      }
      // If index === -1 the parent already resolved us via
      // resolveTokenRefreshWaiters() (which cleared the flag); leave the flag
      // untouched so we never clobber a newer refresh cycle.
      resolve();
    }, 10000);
  });
}

/**
 * Resolve all pending token refresh waiters
 * Called when token-refreshed event is received
 */
function resolveTokenRefreshWaiters(): void {
  isTokenRefreshPending = false;
  const waiters = refreshWaiters;
  refreshWaiters = [];
  waiters.forEach(resolve => resolve());
}

/**
 * Listen for token refresh from parent window
 * Safe to call multiple times - only sets up listener once
 */
let listenerSetup = false;
export function setupTokenRefreshListener(): void {
  if (listenerSetup) return;
  listenerSetup = true;

  window.addEventListener('message', (event: MessageEvent) => {
    // Validate message origin to prevent malicious messages. Resolve the
    // allowed origin dynamically on each message (same helper notifyTokenExpired
    // uses), so the two paths never disagree if the Open-ACE URL changes at
    // runtime — previously this was cached once at setup time.
    const allowedOrigin = getAllowedOrigin();
    if (event.origin !== allowedOrigin && event.origin !== window.location.origin) {
      console.warn("[Token] Ignoring message from untrusted origin:", event.origin);
      return;
    }

    if (event.data?.type === 'openace-token-refreshed') {
      const newToken = event.data.token;
      if (newToken) {
        setToken(newToken);
        // Resolve all pending refresh waiters
        resolveTokenRefreshWaiters();
        // Dispatch custom event so app can retry failed requests
        window.dispatchEvent(new CustomEvent('token-refreshed', { detail: { token: newToken } }));
      }
    }
  });
}
