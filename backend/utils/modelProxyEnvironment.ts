/** Optional per-request credential delegation; never mutates process.env. */
export function modelProxyEnvironment(
  config: { modelProxyBaseUrl?: string; tokenSecret?: string; authType?: string; openaceApiUrl?: string },
  token?: string,
): Record<string, string> | undefined {
  if (!config.modelProxyBaseUrl) return undefined;
  if (!config.tokenSecret || config.authType !== "openai" || config.openaceApiUrl) {
    throw new Error("Delegated model proxy requires authenticated OpenAI mode without another gateway");
  }
  const endpoint = new URL(config.modelProxyBaseUrl);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(endpoint.hostname)))) {
    throw new Error("Invalid delegated model proxy endpoint");
  }
  if (!token || !/^[A-Za-z0-9._~+/:=-]{16,4096}$/.test(token)) {
    throw new Error("A per-request model proxy credential is required");
  }
  return { OPENAI_BASE_URL: config.modelProxyBaseUrl, OPENAI_API_KEY: token };
}
