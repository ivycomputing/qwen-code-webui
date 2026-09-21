import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test re-imports a fresh module (vi.resetModules) so the module-level
// refresh state (isTokenRefreshPending, refreshWaiters, listenerSetup) is clean.
describe("token utilities", () => {
  let token: typeof import("./token");
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let originalParentDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    sessionStorage.clear();
    delete window.__WEBUI_BASENAME__;
    delete window.__WEBUI_CONTEXT_ENABLED__;
    delete window.__WEBUI_CONTEXT_ID__;
    vi.resetModules();
    token = await import("./token");

    postMessageSpy = vi.fn();
    // Simulate being embedded in an iframe: with the real jsdom default
    // (window.parent === window) notifyTokenExpired() is a no-op, so we point
    // parent at a fake window whose postMessage we can observe.
    originalParentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage: postMessageSpy },
    });
  });

  afterEach(() => {
    delete window.__WEBUI_BASENAME__;
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalParentDescriptor) {
      Object.defineProperty(window, "parent", originalParentDescriptor);
    }
  });

  it("keeps same-origin APIs under the configured router mount", () => {
    expect(token.addTokenToUrl("/api/chat")).toBe("/api/chat");
    window.__WEBUI_BASENAME__ = "/portal/agent";
    expect(token.addTokenToUrl("/api/chat")).toBe("/portal/agent/api/chat");
    expect(token.addTokenToUrl("/portal/agent/api/chat")).toBe("/portal/agent/api/chat");
    expect(token.addTokenToUrl("https://example.test/api/chat")).toBe("https://example.test/api/chat");
    window.__WEBUI_BASENAME__ = "//untrusted.test";
    expect(token.addTokenToUrl("/api/chat")).toBe("/api/chat");
  });

  it("keeps a public model selection per tab without adding bearer tokens or external context", () => {
    window.__WEBUI_BASENAME__ = "/portal/agent";
    window.__WEBUI_CONTEXT_ENABLED__ = true;
    window.__WEBUI_CONTEXT_ID__ = "a".repeat(48);
    sessionStorage.setItem("qwen-webui-token", "old-unrelated-token");
    expect(token.addTokenToUrl("/api/chat")).toBe("/portal/agent/api/chat?context_id=" + "a".repeat(48));
    window.__WEBUI_CONTEXT_ID__ = "";
    expect(token.addTokenToUrl("/api/models")).toBe("/portal/agent/api/models?context_id=" + "a".repeat(48));
    expect(token.addTokenToUrl("https://external.test/api/chat")).toBe("https://external.test/api/chat");
    window.__WEBUI_BASENAME__ = "/different-mount";
    expect(token.addTokenToUrl("/api/chat")).toBe("/different-mount/api/chat");
  });

  describe("replaceTokenInUrl", () => {
    it("replaces an existing token parameter in place", () => {
      // URLSearchParams.set() updates the first occurrence in place (it does
      // not reorder existing params), so `token` keeps its leading position.
      expect(
        token.replaceTokenInUrl(
          "https://openace.example/api/projects?token=old&x=1",
          "newtok"
        )
      ).toBe("https://openace.example/api/projects?token=newtok&x=1");
    });

    it("adds a token parameter when none exists", () => {
      expect(
        token.replaceTokenInUrl("https://openace.example/api/projects?x=1", "newtok")
      ).toBe("https://openace.example/api/projects?x=1&token=newtok");
    });

    it("resolves a relative URL against the current origin", () => {
      expect(token.replaceTokenInUrl("/api/projects?token=old", "newtok")).toBe(
        `${window.location.origin}/api/projects?token=newtok`
      );
    });

    it("falls back to the original URL when parsing fails", () => {
      const bogus = "http://[not-a-valid-url";
      expect(token.replaceTokenInUrl(bogus, "newtok")).toBe(bogus);
    });
  });

  describe("notifyAndWaitForTokenRefresh", () => {
    it("notifies the parent only once while a refresh is pending", () => {
      token.notifyAndWaitForTokenRefresh();
      token.notifyAndWaitForTokenRefresh();
      token.notifyAndWaitForTokenRefresh();
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
    });

    it("resolves a waiter via the 10s timeout even without a parent response", async () => {
      const p = token.notifyAndWaitForTokenRefresh();
      let resolved = false;
      p.then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(9999);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(resolved).toBe(true);
    });

    it("re-notifies the parent after timing out without a parent response", async () => {
      // Regression: previously isTokenRefreshPending stayed true after a
      // timeout, so the parent was never re-notified and 401s looped forever
      // (401 → wait 10s → retry stale token → 401 → ...).
      const p1 = token.notifyAndWaitForTokenRefresh();
      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      // Parent never responds → 10s timeout fires.
      await vi.advanceTimersByTimeAsync(10000);
      await p1;

      // A subsequent 401 must re-notify the parent (flag was reset on timeout).
      const p2 = token.notifyAndWaitForTokenRefresh();
      expect(postMessageSpy).toHaveBeenCalledTimes(2);

      // Drain the second waiter so no timer leaks.
      await vi.advanceTimersByTimeAsync(10000);
      await p2;
    });

    it("resolves all concurrent waiters on a single refresh event", async () => {
      token.setupTokenRefreshListener();

      const p1 = token.notifyAndWaitForTokenRefresh();
      const p2 = token.notifyAndWaitForTokenRefresh();
      // Only one notification despite two concurrent waiters.
      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      // Simulate the parent delivering a refreshed token from the trusted origin.
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "openace-token-refreshed", token: "fresh-token" },
        })
      );

      await Promise.all([p1, p2]);
      expect(token.getToken()).toBe("fresh-token");
    });
  });

  describe("setupTokenRefreshListener", () => {
    it("accepts a refreshed token from the trusted origin", () => {
      token.setupTokenRefreshListener();
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "openace-token-refreshed", token: "tok-A" },
        })
      );
      expect(token.getToken()).toBe("tok-A");
    });

    it("ignores a refreshed-token message from an untrusted origin", () => {
      token.setupTokenRefreshListener();
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://evil.example",
          data: { type: "openace-token-refreshed", token: "tok-evil" },
        })
      );
      expect(token.getToken()).toBeUndefined();
    });

    it("ignores unrelated message types", () => {
      token.setupTokenRefreshListener();
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "something-else", token: "tok-X" },
        })
      );
      expect(token.getToken()).toBeUndefined();
    });

    it("registers the message listener only once across repeated calls", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      token.setupTokenRefreshListener();
      token.setupTokenRefreshListener();
      const messageListeners = addSpy.mock.calls.filter(([type]) => type === "message");
      expect(messageListeners).toHaveLength(1);
    });
  });
});
