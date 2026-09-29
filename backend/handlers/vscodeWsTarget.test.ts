/**
 * Tests for the transport-neutral VS Code WebSocket proxy target resolution.
 *
 * The same pure resolver feeds the Node http-proxy upgrade handler and the
 * Deno-native WebSocket relay, so both runtimes rewrite /vscode paths
 * identically (the Deno wiring is the fix for the previously unwired
 * upgrade handler on Deno builds).
 */

import { describe, it, expect } from "vitest";
import { resolveVSCodeWsTarget } from "./vscode.ts";

describe("resolveVSCodeWsTarget", () => {
  it("returns null when no code-server port is known", () => {
    expect(resolveVSCodeWsTarget(null, "/vscode")).toBeNull();
  });

  it("returns null for paths outside the /vscode prefix", () => {
    expect(resolveVSCodeWsTarget(8080, "/api/config")).toBeNull();
    expect(resolveVSCodeWsTarget(8080, "/vscode-something")).toBeNull();
  });

  it("rewrites /vscode and /vscode/ to the target root", () => {
    expect(resolveVSCodeWsTarget(8443, "/vscode")).toEqual({
      httpUrl: "http://localhost:8443",
      path: "/",
    });
    expect(resolveVSCodeWsTarget(8443, "/vscode/")).toEqual({
      httpUrl: "http://localhost:8443",
      path: "/",
    });
  });

  it("strips only the prefix and keeps the rest, including query strings", () => {
    expect(
      resolveVSCodeWsTarget(8443, "/vscode/stable/abc/service?x=1&y=2"),
    ).toEqual({
      httpUrl: "http://localhost:8443",
      path: "/stable/abc/service?x=1&y=2",
    });
  });

  it("does not match the prefix in the middle of a path", () => {
    expect(resolveVSCodeWsTarget(8443, "/foo/vscode/bar")).toBeNull();
  });
});
