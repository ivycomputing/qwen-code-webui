import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDeleteProjectRequest } from "./projects.ts";

// Mock fs utilities
const mockStat = vi.fn();
const mockRemove = vi.fn();

vi.mock("../utils/fs.ts", () => ({
  readDir: vi.fn(),
  stat: (...args: unknown[]) => mockStat(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
}));

// Mock os utilities
vi.mock("../utils/os.ts", () => ({
  getHomeDir: () => "/home/testuser",
}));

// Mock logger
vi.mock("../utils/logger.ts", () => ({
  logger: {
    api: {
      info: vi.fn(),
      error: vi.fn(),
    },
  },
}));

// Mock projectMapping
vi.mock("../utils/projectMapping.ts", () => ({
  decodeProjectPath: vi.fn(),
}));

function createMockContext(param: string) {
  return {
    req: {
      param: (name: string) => (name === "encodedProjectName" ? param : undefined),
    },
    json: vi.fn((data: unknown, status?: number) => ({ data, status })),
  } as unknown as Parameters<typeof handleDeleteProjectRequest>[0];
}

describe("handleDeleteProjectRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStat.mockResolvedValue({ isDirectory: true });
    mockRemove.mockResolvedValue(undefined);
  });

  it("should reject path traversal with ..", async () => {
    const c = createMockContext("..");
    const result = await handleDeleteProjectRequest(c);
    const response = result as { data: { error: string }; status?: number };
    expect(response.data.error).toBe("Invalid project name");
  });

  it("should allow ..-prefix names that resolve inside projectsDir", async () => {
    // "..other" resolves to projectsDir/..other which stays inside projectsDir
    // This is NOT a traversal — it's a valid (though unusual) directory name
    const c = createMockContext("..other");
    const result = await handleDeleteProjectRequest(c);
    const response = result as { data: { success: boolean } };
    // Stat mock returns isDirectory: true, so it succeeds
    expect(response.data.success).toBe(true);
  });

  it("should verify ..-prefix name resolves inside projectsDir", async () => {
    // Confirm that "..other" resolves within projectsDir, not its parent
    const path = await import("node:path");
    const resolved = path.resolve("/home/testuser/.qwen/projects", "..other");
    expect(resolved.startsWith("/home/testuser/.qwen/projects" + path.sep)).toBe(true);
  });

  it("should reject pure parent directory traversal", async () => {
    const c = createMockContext("..");
    const result = await handleDeleteProjectRequest(c);
    const response = result as { data: { error: string }; status?: number };
    expect(response.data.error).toBe("Invalid project name");
  });

  it("should reject empty project name", async () => {
    const c = createMockContext("");
    const result = await handleDeleteProjectRequest(c);
    const response = result as { data: { error: string }; status?: number };
    expect(response.data.error).toBe("Project name is required");
  });

  it("should reject project name with slashes", async () => {
    const c = createMockContext("foo/bar");
    const result = await handleDeleteProjectRequest(c);
    const response = result as { data: { error: string }; status?: number };
    expect(response.data.error).toBe("Invalid project name");
  });

  it("should reject project name with backslashes", async () => {
    const c = createMockContext("foo\\bar");
    const result = await handleDeleteProjectRequest(c);
    const response = result as { data: { error: string }; status?: number };
    expect(response.data.error).toBe("Invalid project name");
  });

  it("should allow and successfully delete a valid project", async () => {
    const c = createMockContext("-home-testuser-my-project");
    const result = await handleDeleteProjectRequest(c);
    const response = result as { data: { success: boolean; message: string } };
    expect(response.data.success).toBe(true);
    expect(mockRemove).toHaveBeenCalledWith(
      "/home/testuser/.qwen/projects/-home-testuser-my-project",
    );
  });

  it("should return 404 when project directory does not exist", async () => {
    mockStat.mockRejectedValue(new Error("not found"));
    const c = createMockContext("-home-testuser-nonexistent");
    const result = await handleDeleteProjectRequest(c);
    const response = result as { data: { error: string }; status?: number };
    expect(response.data.error).toBe("Project not found");
  });
});
