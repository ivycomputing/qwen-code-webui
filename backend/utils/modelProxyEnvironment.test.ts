import { describe, expect, it } from "vitest";
import { modelProxyEnvironment } from "./modelProxyEnvironment.ts";

describe("per-request model proxy environment", () => {
  const config = { modelProxyBaseUrl: "http://127.0.0.1:9700/model-proxy", tokenSecret: "server-auth", authType: "openai" };
  it("keeps independent credentials and never mutates process environment", () => {
    const original = process.env.OPENAI_API_KEY;
    const first = modelProxyEnvironment(config, "first-ephemeral-grant");
    const second = modelProxyEnvironment(config, "second-ephemeral-grant");
    expect(first?.OPENAI_API_KEY).toBe("first-ephemeral-grant");
    expect(second?.OPENAI_API_KEY).toBe("second-ephemeral-grant");
    expect(process.env.OPENAI_API_KEY === original).toBe(true);
    expect(modelProxyEnvironment({}, "ignored-header")).toBeUndefined();
  });
  it("requires authenticated explicit configuration and rejects missing credentials or another gateway", () => {
    expect(() => modelProxyEnvironment(config)).toThrow();
    expect(() => modelProxyEnvironment(config, "line\nbreak")).toThrow();
    expect(() => modelProxyEnvironment({ ...config, tokenSecret: undefined }, "temporary-proxy-token")).toThrow();
    expect(() => modelProxyEnvironment({ ...config, openaceApiUrl: "https://gateway.test" }, "temporary-proxy-token")).toThrow();
    expect(() => modelProxyEnvironment({ ...config, modelProxyBaseUrl: "http://10.0.0.1/proxy" }, "temporary-proxy-token")).toThrow();
    expect(() => modelProxyEnvironment({ ...config, modelProxyBaseUrl: "https://secret@provider.test" }, "temporary-proxy-token")).toThrow();
  });
});
