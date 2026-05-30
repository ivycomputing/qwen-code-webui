import { describe, it, expect, vi, beforeEach } from "vitest";
import { handlePermissionRespond, type PendingPermission } from "./permission.ts";
import type { PermissionRespondRequest } from "../../shared/types.ts";
import type { PermissionResult } from "@qwen-code/sdk";

// Mock Hono context
function createMockContext(body: PermissionRespondRequest) {
  return {
    req: {
      json: vi.fn().mockResolvedValue(body),
    },
    json: vi.fn().mockImplementation((data, status?: number) => {
      return { data, status };
    }),
  } as unknown as Parameters<typeof handlePermissionRespond>[0];
}

describe("handlePermissionRespond", () => {
  const pendingPermissions = new Map<string, PendingPermission>();
  let mockResolve: ReturnType<typeof vi.fn>;
  let mockAbortSignal: AbortSignal;

  beforeEach(() => {
    pendingPermissions.clear();
    mockResolve = vi.fn();
    mockAbortSignal = new AbortController().signal;
  });

  describe("Basic functionality", () => {
    it("returns 400 for missing permissionId", async () => {
      const ctx = createMockContext({
        permissionId: "",
        behavior: "allow",
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(ctx.json).toHaveBeenCalledWith(
        { error: "Missing permissionId or behavior" },
        400,
      );
    });

    it("returns 400 for missing behavior", async () => {
      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "invalid" as "allow" | "deny",
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(ctx.json).toHaveBeenCalledWith(
        { error: "Invalid behavior" },
        400,
      );
    });

    it("returns 404 for unknown permissionId", async () => {
      const ctx = createMockContext({
        permissionId: "unknown-id",
        behavior: "allow",
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(ctx.json).toHaveBeenCalledWith(
        { error: "Permission request not found or expired" },
        404,
      );
    });

    it("returns 410 for aborted request", async () => {
      const abortController = new AbortController();
      abortController.abort();

      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: abortController.signal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "allow",
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(ctx.json).toHaveBeenCalledWith(
        { error: "Request was aborted" },
        410,
      );
    });
  });

  describe("Allow behavior", () => {
    it("resolves with allow for basic allow request", async () => {
      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: mockAbortSignal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "allow",
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(mockResolve).toHaveBeenCalledWith(
        { behavior: "allow", updatedInput: {} },
        undefined,
      );
      expect(ctx.json).toHaveBeenCalledWith({ success: true });
      expect(pendingPermissions.has("test-id")).toBe(false);
    });

    it("resolves with updatedInput for allow request", async () => {
      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: mockAbortSignal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "allow",
        updatedInput: { command: "ls" },
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(mockResolve).toHaveBeenCalledWith(
        { behavior: "allow", updatedInput: { command: "ls" } },
        undefined,
      );
    });

    it("resolves with scope for shell command", async () => {
      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: mockAbortSignal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "allow",
        scope: "specific",
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(mockResolve).toHaveBeenCalledWith(
        { behavior: "allow", updatedInput: {} },
        "specific",
      );
    });
  });

  describe("Deny behavior", () => {
    it("resolves with deny and default message", async () => {
      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: mockAbortSignal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "deny",
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(mockResolve).toHaveBeenCalledWith({
        behavior: "deny",
        message: "User denied this tool call [proactive]",
      });
      expect(pendingPermissions.has("test-id")).toBe(false);
    });

    it("resolves with deny and custom message", async () => {
      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: mockAbortSignal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "deny",
        message: "Custom rejection reason",
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(mockResolve).toHaveBeenCalledWith({
        behavior: "deny",
        message: "Custom rejection reason [proactive]",
      });
    });
  });

  describe("AskUserQuestion answers support", () => {
    it("includes answers in updatedInput for allow request", async () => {
      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: mockAbortSignal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "allow",
        answers: { "0": "React", "1": "Dark mode" },
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(mockResolve).toHaveBeenCalledWith(
        { behavior: "allow", updatedInput: { answers: { "0": "React", "1": "Dark mode" } } },
        undefined,
      );
    });

    it("combines updatedInput and answers", async () => {
      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: mockAbortSignal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "allow",
        updatedInput: { command: "test" },
        answers: { "0": "Option A" },
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(mockResolve).toHaveBeenCalledWith(
        { behavior: "allow", updatedInput: { command: "test", answers: { "0": "Option A" } } },
        undefined,
      );
    });

    it("does not include answers in deny request", async () => {
      pendingPermissions.set("test-id", {
        resolve: mockResolve,
        abortSignal: mockAbortSignal,
      });

      const ctx = createMockContext({
        permissionId: "test-id",
        behavior: "deny",
        answers: { "0": "React" },
      });
      const result = await handlePermissionRespond(ctx, pendingPermissions);

      expect(mockResolve).toHaveBeenCalledWith({
        behavior: "deny",
        message: "User denied this tool call [proactive]",
      });
    });
  });
});