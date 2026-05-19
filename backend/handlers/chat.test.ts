import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Context } from "hono";
import { handleChatRequest } from "./chat";
import type { ChatRequest } from "../../shared/types";
import { query } from "@qwen-code/sdk";

// Define minimal mock types for Qwen Code SDK to maintain type safety in tests
type MockQwenCode = {
  query: typeof vi.fn;
};

vi.mock(
  "@qwen-code/sdk",
  (): MockQwenCode => ({
    query: vi.fn(),
  }),
);

// Mock logger
vi.mock("../utils/logger", () => ({
  logger: {
    chat: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

// Mock sessionBridge to pass through sessionId unchanged
vi.mock("../utils/sessionBridge.ts", () => ({
  bridgeSession: vi.fn((_cwd: string, sessionId: string | undefined) =>
    Promise.resolve(sessionId),
  ),
}));

const mockQuery = vi.mocked(query);

describe("Chat Handler - Permission Mode Tests", () => {
  let mockContext: Context;
  let requestAbortControllers: Map<string, AbortController>;
  let pendingPermissions: Map<string, any>;

  beforeEach(() => {
    requestAbortControllers = new Map();
    pendingPermissions = new Map();

    // Create mock context
    mockContext = {
      req: {
        json: vi.fn(),
      },
      var: {
        config: {
          cliPath: "/path/to/claude-cli",
        },
      },
    } as any;

    vi.clearAllMocks();
  });

  afterEach(() => {
    requestAbortControllers.clear();
  });

  describe("Permission Mode Parameter Handling", () => {
    it("should pass permissionMode 'plan' to Qwen SDK", async () => {
      const chatRequest: ChatRequest = {
        message: "Test message",
        requestId: "test-123",
        permissionMode: "plan",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      // Mock SDK to return simple message and complete
      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      const response = await handleChatRequest(
        mockContext,
        requestAbortControllers,
        pendingPermissions,
      );

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Test message",
        options: expect.objectContaining({
          permissionMode: "plan",
          abortController: expect.any(AbortController),
          pathToQwenExecutable: "/path/to/claude-cli",
        }),
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    });

    it("should pass permissionMode 'auto-edit' to Qwen SDK", async () => {
      const chatRequest: ChatRequest = {
        message: "Test message",
        requestId: "test-456",
        permissionMode: "auto-edit",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Test message",
        options: expect.objectContaining({
          permissionMode: "auto-edit",
        }),
      });
    });

    it("should pass permissionMode 'default' to Qwen SDK", async () => {
      const chatRequest: ChatRequest = {
        message: "Test message",
        requestId: "test-789",
        permissionMode: "default",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Test message",
        options: expect.objectContaining({
          permissionMode: "default",
        }),
      });
    });

    it("should pass permissionMode 'yolo' to Qwen SDK", async () => {
      const chatRequest: ChatRequest = {
        message: "Test message",
        requestId: "test-yolo",
        permissionMode: "yolo",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Test message",
        options: expect.objectContaining({
          permissionMode: "yolo",
        }),
      });
    });

    it("should not include permissionMode in options when undefined", async () => {
      const chatRequest: ChatRequest = {
        message: "Test message",
        requestId: "test-undefined",
        // permissionMode is undefined
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.options).not.toHaveProperty("permissionMode");
    });

    it("should handle permissionMode alongside other parameters", async () => {
      const chatRequest: ChatRequest = {
        message: "Test message with all params",
        requestId: "test-all-params",
        sessionId: "session-123",
        allowedTools: ["Bash", "Edit"],
        workingDirectory: "/project/path",
        permissionMode: "plan",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Test message with all params",
        options: expect.objectContaining({
          permissionMode: "plan",
          resume: "session-123",
          allowedTools: ["Bash", "Edit"],
          cwd: "/project/path",
          abortController: expect.any(AbortController),
          pathToQwenExecutable: "/path/to/claude-cli",
          stderr: true,
          canUseTool: expect.any(Function),
          timeout: expect.objectContaining({
            canUseTool: expect.any(Number),
            controlRequest: expect.any(Number),
          }),
        }),
      });
    });
  });

  describe("Message Processing with Permission Mode", () => {
    it("should process slash commands with permissionMode", async () => {
      const chatRequest: ChatRequest = {
        message: "/help",
        requestId: "test-slash",
        permissionMode: "plan",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Help response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      // Should strip the slash and pass "help" to SDK
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "help",
        options: expect.objectContaining({
          permissionMode: "plan",
        }),
      });
    });

    it("should handle regular messages with permissionMode", async () => {
      const chatRequest: ChatRequest = {
        message: "Regular message",
        requestId: "test-regular",
        permissionMode: "auto-edit",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Regular response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Regular message",
        options: expect.objectContaining({
          permissionMode: "auto-edit",
        }),
      });
    });
  });

  describe("Stream Response Generation", () => {
    it("should yield SDK messages with permissionMode context", async () => {
      const chatRequest: ChatRequest = {
        message: "Test streaming",
        requestId: "test-stream",
        permissionMode: "plan",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      const mockMessages = [
        {
          type: "system",
          subtype: "init",
          cwd: "/test",
          tools: [],
          session_id: "test",
          apiKeySource: "env",
          mcp_servers: {},
          model: "test",
          is_resuming: false,
        } as any,
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "Streaming response" }] },
          session_id: "test",
          parent_tool_use_id: null,
        } as any,
        {
          type: "result",
          subtype: "success",
          usage: { input_tokens: 10, output_tokens: 5 },
          session_id: "test",
        } as any,
      ];

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const message of mockMessages) {
            yield message;
          }
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      const response = await handleChatRequest(
        mockContext,
        requestAbortControllers,
        pendingPermissions,
      );
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      let allChunks = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        allChunks += decoder.decode(value);
      }

      const lines = allChunks.trim().split("\n");
      expect(lines).toHaveLength(4); // 3 SDK messages + 1 done message

      // Parse each line to verify structure
      const parsedLines = lines.map((line) => JSON.parse(line));

      expect(parsedLines[0]).toEqual({
        type: "claude_json",
        data: mockMessages[0],
      });

      expect(parsedLines[1]).toEqual({
        type: "claude_json",
        data: mockMessages[1],
      });

      expect(parsedLines[2]).toEqual({
        type: "claude_json",
        data: mockMessages[2],
      });

      expect(parsedLines[3]).toEqual({
        type: "done",
      });
    });
  });

  describe("Error Handling with Permission Mode", () => {
    it("should handle SDK errors when using permissionMode", async () => {
      const chatRequest: ChatRequest = {
        message: "Error test",
        requestId: "test-error",
        permissionMode: "plan",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          throw new Error("SDK execution failed");
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      const response = await handleChatRequest(
        mockContext,
        requestAbortControllers,
        pendingPermissions,
      );
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      let allChunks = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        allChunks += decoder.decode(value);
      }

      const lines = allChunks.trim().split("\n");
      expect(lines).toHaveLength(2);

      const errorResponse = JSON.parse(lines[0]);
      expect(errorResponse).toEqual({
        type: "error",
        error: "SDK execution failed",
      });

      const doneResponse = JSON.parse(lines[1]);
      expect(doneResponse).toEqual({ type: "done" });
    });

    // TODO: Re-enable when AbortError is properly exported from Claude SDK
    it.skip("should handle abort errors when using permissionMode", async () => {
      // Test currently skipped because AbortError is not exported from Claude SDK
      // When AbortError becomes available, update this test accordingly
      const chatRequest: ChatRequest = {
        message: "Abort test",
        requestId: "test-abort",
        permissionMode: "auto-edit",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          throw new Error("Operation aborted");
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      const response = await handleChatRequest(
        mockContext,
        requestAbortControllers,
        pendingPermissions,
      );
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      let allChunks = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        allChunks += decoder.decode(value);
      }

      const lines = allChunks.trim().split("\n");
      expect(lines).toHaveLength(1);

      const errorResponse = JSON.parse(lines[0]);
      expect(errorResponse).toEqual({
        type: "error",
        error: "Operation aborted",
      });
    });
  });

  describe("AuthType Parameter Handling", () => {
    it("should pass authType to Qwen SDK when configured", async () => {
      const chatRequest: ChatRequest = {
        message: "Test message",
        requestId: "test-auth-type",
      };

      (mockContext.var as any).config = {
        cliPath: "/path/to/claude-cli",
        authType: "openai",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Test message",
        options: expect.objectContaining({
          authType: "openai",
          abortController: expect.any(AbortController),
          pathToQwenExecutable: "/path/to/claude-cli",
        }),
      });
    });

    it("should not include authType in options when not configured", async () => {
      const chatRequest: ChatRequest = {
        message: "Test message",
        requestId: "test-no-auth-type",
      };

      // No authType in config (default mock)
      (mockContext.var as any).config = {
        cliPath: "/path/to/claude-cli",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.options).not.toHaveProperty("authType");
    });

    it("should pass authType alongside other parameters", async () => {
      const chatRequest: ChatRequest = {
        message: "Test all params with auth",
        requestId: "test-auth-all",
        sessionId: "session-456",
        permissionMode: "plan",
        workingDirectory: "/project/path",
      };

      (mockContext.var as any).config = {
        cliPath: "/path/to/claude-cli",
        authType: "anthropic",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Test all params with auth",
        options: expect.objectContaining({
          authType: "anthropic",
          permissionMode: "plan",
          resume: "session-456",
          cwd: "/project/path",
          abortController: expect.any(AbortController),
          pathToQwenExecutable: "/path/to/claude-cli",
          stderr: true,
          canUseTool: expect.any(Function),
          timeout: expect.objectContaining({
            canUseTool: expect.any(Number),
            controlRequest: expect.any(Number),
          }),
        }),
      });
    });
  });

  describe("canUseTool - allowedTools matching", () => {
    let capturedCanUseTool: ((toolName: string, input: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<any>) | null = null;

    async function setupWithCanUseTool(allowedTools?: string[]) {
      const chatRequest: ChatRequest = {
        message: "Test message",
        requestId: "test-canusetool",
        allowedTools,
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      capturedCanUseTool = null;

      mockQuery.mockImplementation(
        (args: any) =>
          ({
            [Symbol.asyncIterator]: async function* () {
              capturedCanUseTool = args.options.canUseTool;
              yield {
                type: "assistant",
                message: { content: [{ type: "text", text: "Response" }] },
                session_id: "test-session",
                parent_tool_use_id: null,
              } as any;
            },
            interrupt: vi.fn(),
            next: vi.fn(),
            return: vi.fn(),
            throw: vi.fn(),
          }) as any,
      );

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);
      expect(capturedCanUseTool).not.toBeNull();
    }

    it("should auto-approve edit when in allowedTools", async () => {
      await setupWithCanUseTool(["edit"]);

      const result = await capturedCanUseTool!(
        "edit",
        { file_path: "/test.ts", old_string: "a", new_string: "b" },
        { signal: new AbortController().signal },
      );

      expect(result).toEqual({ behavior: "allow", updatedInput: { file_path: "/test.ts", old_string: "a", new_string: "b" } });
    });

    it("should auto-approve read-only tools regardless of allowedTools", async () => {
      await setupWithCanUseTool(undefined);

      const result = await capturedCanUseTool!(
        "read_file",
        { file_path: "/test.ts" },
        { signal: new AbortController().signal },
      );

      expect(result).toEqual({ behavior: "allow", updatedInput: { file_path: "/test.ts" } });
    });

    it("should auto-approve web_fetch as read-only", async () => {
      await setupWithCanUseTool(undefined);

      const result = await capturedCanUseTool!(
        "web_fetch",
        { url: "https://example.com" },
        { signal: new AbortController().signal },
      );

      expect(result).toEqual({ behavior: "allow", updatedInput: { url: "https://example.com" } });
    });

    it("should auto-approve think as read-only", async () => {
      await setupWithCanUseTool(undefined);

      const result = await capturedCanUseTool!(
        "think",
        { thought: "thinking..." },
        { signal: new AbortController().signal },
      );

      expect(result).toEqual({ behavior: "allow", updatedInput: { thought: "thinking..." } });
    });

    it("should auto-approve run_shell_command matching command prefix", async () => {
      await setupWithCanUseTool(["run_shell_command(git:*)"]);

      const result = await capturedCanUseTool!(
        "run_shell_command",
        { command: "git status" },
        { signal: new AbortController().signal },
      );

      expect(result).toEqual({ behavior: "allow", updatedInput: { command: "git status" } });
    });

    it("should deny run_shell_command when command prefix does not match", async () => {
      await setupWithCanUseTool(["run_shell_command(git:*)"]);

      // Without a pending permission resolution, the callback will send a permission_request
      // and wait forever. We abort to get a denial.
      const abortController = new AbortController();
      const promise = capturedCanUseTool!(
        "run_shell_command",
        { command: "rm -rf /" },
        { signal: abortController.signal },
      );

      // Give it a tick to reach the pending state, then abort
      await new Promise(resolve => setTimeout(resolve, 10));
      abortController.abort();

      const result = await promise;
      expect(result.behavior).toBe("deny");
    });

    it("should auto-approve run_shell_command with bare tool name", async () => {
      await setupWithCanUseTool(["run_shell_command"]);

      const result = await capturedCanUseTool!(
        "run_shell_command",
        { command: "npm install" },
        { signal: new AbortController().signal },
      );

      expect(result).toEqual({ behavior: "allow", updatedInput: { command: "npm install" } });
    });

    it("should auto-approve multi-word command prefixes", async () => {
      await setupWithCanUseTool(["run_shell_command(npm run build:*)"]);

      const result = await capturedCanUseTool!(
        "run_shell_command",
        { command: "npm run build --production" },
        { signal: new AbortController().signal },
      );

      expect(result).toEqual({ behavior: "allow", updatedInput: { command: "npm run build --production" } });
    });

    it("should not auto-approve when allowedTools is empty", async () => {
      await setupWithCanUseTool([]);

      const abortController = new AbortController();
      const promise = capturedCanUseTool!(
        "edit",
        { file_path: "/test.ts", old_string: "a", new_string: "b" },
        { signal: abortController.signal },
      );

      await new Promise(resolve => setTimeout(resolve, 10));
      abortController.abort();

      const result = await promise;
      expect(result.behavior).toBe("deny");
    });

    it("should not auto-approve when allowedTools is undefined", async () => {
      await setupWithCanUseTool(undefined);

      const abortController = new AbortController();
      const promise = capturedCanUseTool!(
        "edit",
        { file_path: "/test.ts", old_string: "a", new_string: "b" },
        { signal: abortController.signal },
      );

      await new Promise(resolve => setTimeout(resolve, 10));
      abortController.abort();

      const result = await promise;
      expect(result.behavior).toBe("deny");
    });
  });

  describe("Session Concurrency Guard", () => {
    it("should abort existing request when new request arrives for same session", async () => {
      let resolveBlocker: () => void;
      const blocker = new Promise<void>((r) => { resolveBlocker = r; });

      const firstRequest: ChatRequest = {
        message: "First message",
        requestId: "req-concurrent-1",
        sessionId: "sess-concurrent",
      };
      mockContext.req.json = vi.fn().mockResolvedValueOnce(firstRequest);

      mockQuery.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield { type: "assistant", message: { content: [{ type: "text", text: "First" }] }, session_id: "sess-concurrent", parent_tool_use_id: null } as any;
          await blocker;
        },
      } as any);

      const response1 = await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);
      const reader1 = response1.body!.getReader();
      await reader1.read();
      await new Promise(r => setTimeout(r, 50));

      expect(requestAbortControllers.has("req-concurrent-1")).toBe(true);
      const firstAc = requestAbortControllers.get("req-concurrent-1")!;
      expect(firstAc.signal.aborted).toBe(false);

      const secondRequest: ChatRequest = {
        message: "Second message",
        requestId: "req-concurrent-2",
        sessionId: "sess-concurrent",
      };
      mockContext.req.json = vi.fn().mockResolvedValueOnce(secondRequest);
      mockQuery.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield { type: "assistant", message: { content: [{ type: "text", text: "Second" }] }, session_id: "sess-concurrent", parent_tool_use_id: null } as any;
        },
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(firstAc.signal.aborted).toBe(true);
      expect(requestAbortControllers.has("req-concurrent-1")).toBe(false);

      resolveBlocker();
      reader1.cancel().catch(() => {});
    });

    it("should not interfere with requests that have no sessionId", async () => {
      const req1: ChatRequest = { message: "Msg 1", requestId: "req-no-session-1" };
      const req2: ChatRequest = { message: "Msg 2", requestId: "req-no-session-2" };

      mockContext.req.json = vi.fn()
        .mockResolvedValueOnce(req1)
        .mockResolvedValueOnce(req2);

      const makeIterator = () => ({
        [Symbol.asyncIterator]: async function* () {
          yield { type: "assistant", message: { content: [{ type: "text", text: "OK" }] }, session_id: "s", parent_tool_use_id: null } as any;
        },
      } as any);

      mockQuery.mockReturnValueOnce(makeIterator()).mockReturnValueOnce(makeIterator());

      const res1 = await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);
      const res2 = await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      for (const res of [res1, res2]) {
        const reader = res.body!.getReader();
        while (true) { const { done } = await reader.read(); if (done) break; }
      }

      expect(requestAbortControllers.size).toBe(0);
    });

    it("should clean up session mapping after request completes normally", async () => {
      const req: ChatRequest = { message: "Msg", requestId: "req-cleanup", sessionId: "sess-cleanup-test" };
      mockContext.req.json = vi.fn().mockResolvedValue(req);
      mockQuery.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield { type: "assistant", message: { content: [{ type: "text", text: "Done" }] }, session_id: "sess-cleanup-test", parent_tool_use_id: null } as any;
        },
      } as any);

      const res = await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);
      const reader = res.body!.getReader();
      while (true) { const { done } = await reader.read(); if (done) break; }

      expect(requestAbortControllers.has("req-cleanup")).toBe(false);
    });

    it("should resolve pending permissions from superseded request", async () => {
      let capturedCanUseTool: any;
      let resolveBlocker: () => void;
      const blocker = new Promise<void>((r) => { resolveBlocker = r; });

      const firstRequest: ChatRequest = {
        message: "Msg",
        requestId: "req-pp-1",
        sessionId: "sess-pp",
      };
      mockContext.req.json = vi.fn().mockResolvedValueOnce(firstRequest);

      mockQuery.mockImplementationOnce((args: any) => ({
        [Symbol.asyncIterator]: async function* () {
          capturedCanUseTool = args.options.canUseTool;
          yield { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] }, session_id: "sess-pp", parent_tool_use_id: null } as any;
          await blocker;
        },
      } as any));

      const res1 = await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);
      const reader1 = res1.body!.getReader();
      await reader1.read();
      await new Promise(r => setTimeout(r, 50));

      const ac1 = requestAbortControllers.get("req-pp-1")!;
      const canUseToolPromise = capturedCanUseTool!("edit", { file: "/test" }, { signal: ac1.signal });
      await new Promise(r => setTimeout(r, 50));
      expect(pendingPermissions.size).toBeGreaterThan(0);

      const secondRequest: ChatRequest = {
        message: "Msg 2",
        requestId: "req-pp-2",
        sessionId: "sess-pp",
      };
      mockContext.req.json = vi.fn().mockResolvedValue(secondRequest);
      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { type: "assistant", message: { content: [{ type: "text", text: "World" }] }, session_id: "sess-pp", parent_tool_use_id: null } as any;
        },
      } as any);

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      const result = await canUseToolPromise;
      expect(result.behavior).toBe("deny");

      resolveBlocker();
      reader1.cancel().catch(() => {});
    });
  });

  describe("Abort Controller Management with Permission Mode", () => {
    it("should manage abort controller correctly with permissionMode", async () => {
      const chatRequest: ChatRequest = {
        message: "Controller test",
        requestId: "test-controller",
        permissionMode: "plan",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      mockQuery.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Response" }] },
            session_id: "test-session",
            parent_tool_use_id: null,
          } as any;
        },
        interrupt: vi.fn(),
        next: vi.fn(),
        return: vi.fn(),
        throw: vi.fn(),
      } as any);

      expect(requestAbortControllers.size).toBe(0);

      const response = await handleChatRequest(
        mockContext,
        requestAbortControllers,
        pendingPermissions,
      );

      // Read the response to ensure the generator completes
      const reader = response.body!.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Controller should be cleaned up after completion
      expect(requestAbortControllers.size).toBe(0);
    });

    it("should store and retrieve abort controller during execution", async () => {
      const chatRequest: ChatRequest = {
        message: "Controller tracking",
        requestId: "test-tracking",
        permissionMode: "auto-edit",
      };

      mockContext.req.json = vi.fn().mockResolvedValue(chatRequest);

      let capturedController: AbortController | null = null;

      mockQuery.mockImplementation(
        (args: any) =>
          ({
            [Symbol.asyncIterator]: async function* () {
              capturedController = args.options.abortController;
              expect(requestAbortControllers.has("test-tracking")).toBe(true);
              yield {
                type: "assistant",
                message: { content: [{ type: "text", text: "Response" }] },
                session_id: "test-session",
                parent_tool_use_id: null,
              } as any;
            },
            interrupt: vi.fn(),
            next: vi.fn(),
            return: vi.fn(),
            throw: vi.fn(),
          }) as any,
      );

      await handleChatRequest(mockContext, requestAbortControllers, pendingPermissions);

      expect(capturedController).toBeInstanceOf(AbortController);
    });
  });
});
