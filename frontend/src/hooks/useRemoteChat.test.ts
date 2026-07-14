import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  abortRemoteRequest,
  createRemoteSession,
  createRemoteSessionStreamWithReconnect,
  getRemoteSessionStatus,
  pauseRemoteSession,
  resumeRemoteSession,
  sendPermissionResponse,
  sendRemoteMessage,
  stopRemoteSession,
  switchRemoteModel,
} from "../api/openace";
import { useRemoteChat } from "./useRemoteChat";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("../api/openace", () => ({
  createRemoteSession: vi.fn(),
  sendRemoteMessage: vi.fn(),
  stopRemoteSession: vi.fn(),
  abortRemoteRequest: vi.fn(),
  getRemoteSessionStatus: vi.fn(),
  createRemoteSessionStream: vi.fn(),
  createRemoteSessionStreamWithReconnect: vi.fn(),
  sendPermissionResponse: vi.fn(),
  switchRemoteModel: vi.fn(),
  pauseRemoteSession: vi.fn(),
  resumeRemoteSession: vi.fn(),
}));

describe("useRemoteChat", () => {
  const streamCallbacks: {
    onLine?: (line: string) => void;
    onError?: (err: Event) => void;
    onDone?: () => void;
  } = {};

  const streamingContext = {
    setCurrentThinkingMessage: vi.fn(),
    setCurrentAssistantMessage: vi.fn(),
  };

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    streamCallbacks.onLine = undefined;
    streamCallbacks.onError = undefined;
    streamCallbacks.onDone = undefined;

    vi.mocked(createRemoteSession).mockResolvedValue({
      session: {
        session_id: "remote-session-1",
        status: "active",
        model: "test-model",
      },
    } as never);
    vi.mocked(sendRemoteMessage).mockResolvedValue({ success: true } as never);
    vi.mocked(abortRemoteRequest).mockResolvedValue({ success: true } as never);
    vi.mocked(stopRemoteSession).mockResolvedValue({ success: true } as never);
    vi.mocked(getRemoteSessionStatus).mockResolvedValue({
      success: true,
      session: {
        session_id: "remote-session-1",
        status: "active",
        model: "test-model",
      },
    } as never);
    vi.mocked(sendPermissionResponse).mockResolvedValue({ success: true } as never);
    vi.mocked(switchRemoteModel).mockResolvedValue({ success: true } as never);
    vi.mocked(pauseRemoteSession).mockResolvedValue({ success: true } as never);
    vi.mocked(resumeRemoteSession).mockResolvedValue({ success: true } as never);
    vi.mocked(createRemoteSessionStreamWithReconnect).mockImplementation(
      ((_sessionId, options) => {
        streamCallbacks.onLine = options.onLine;
        streamCallbacks.onError = options.onError;
        streamCallbacks.onDone = options.onDone;
        return { close: vi.fn() } as unknown as EventSource;
      }) as typeof createRemoteSessionStreamWithReconnect
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps remote Stop in stopping state until an aborted event arrives", async () => {
    const { result } = renderHook(() =>
      useRemoteChat({
        onStreamLine: vi.fn(),
        streamingContext: streamingContext as never,
      })
    );

    await act(async () => {
      await result.current.startSession("machine-1", "/workspace", "test-model");
    });

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isStopping).toBe(false);

    await act(async () => {
      await result.current.abortCurrentRequest("user");
    });

    expect(abortRemoteRequest).toHaveBeenCalledWith("remote-session-1", "user");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isStopping).toBe(true);

    act(() => {
      streamCallbacks.onLine?.(
        JSON.stringify({
          type: "request_state",
          data: { type: "aborted", reason: "user" },
        })
      );
    });

    expect(result.current.isStopping).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(streamingContext.setCurrentThinkingMessage).toHaveBeenCalledWith(null);
    expect(streamingContext.setCurrentAssistantMessage).toHaveBeenCalledWith(null);
  });

  it("surfaces abort_failed without pretending the request stopped", async () => {
    const { result } = renderHook(() =>
      useRemoteChat({
        onStreamLine: vi.fn(),
        streamingContext: streamingContext as never,
      })
    );

    await act(async () => {
      await result.current.startSession("machine-1", "/workspace", "test-model");
    });

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    await act(async () => {
      await result.current.abortCurrentRequest("timeout");
    });

    act(() => {
      streamCallbacks.onLine?.(
        JSON.stringify({
          type: "request_state",
          data: {
            type: "abort_failed",
            reason: "timeout",
            message: "interrupt failed",
          },
        })
      );
    });

    expect(result.current.isStopping).toBe(false);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe("interrupt failed");
  });

  it("times out if remote abort is never confirmed", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useRemoteChat({
        onStreamLine: vi.fn(),
        streamingContext: streamingContext as never,
      })
    );

    await act(async () => {
      await result.current.startSession("machine-1", "/workspace", "test-model");
    });

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    await act(async () => {
      await result.current.abortCurrentRequest("user");
    });

    expect(result.current.isStopping).toBe(true);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.isStopping).toBe(false);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe("Remote stop was not confirmed");
  });
});
