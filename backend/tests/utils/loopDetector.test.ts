/**
 * Tests for the loop detection preview (raw error snippet next to the
 * opaque hash fingerprint) — review feedback on #224/#227.
 */
import { describe, it, expect } from "vitest";
import { extractErrorFingerprint, checkLoop, type LoopState } from "../../utils/loopDetector.js";

function sdkError(text: string) {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text, is_error: true }],
    },
  };
}

describe("loopDetector preview", () => {
  it("returns a preview of the normalized error content on detection", () => {
    const longError = "FAILED test_auth.py::test_login - AssertionError: expected 200, got 401";
    const state = { errorCount: 0, lastFingerprint: "", firstErrorTime: 0 };
    let result: ReturnType<typeof checkLoop> = null;
    for (let i = 0; i < 3 && !result; i++) {
      result = checkLoop(sdkError(longError), state);
    }
    expect(result).not.toBeNull();
    expect(result!.fingerprint).toMatch(/^[0-9a-z]+$/);
    expect(result!.preview).toBe(longError.toLowerCase().slice(0, 60));
  });

  it("caps the preview at 60 characters and collapses whitespace", () => {
    const spaced = Array(20).fill("line of   output").join("\n");
    const state = { errorCount: 0, lastFingerprint: "", firstErrorTime: 0 };
    let result: ReturnType<typeof checkLoop> = null;
    for (let i = 0; i < 3 && !result; i++) {
      result = checkLoop(sdkError(spaced), state);
    }
    expect(result!.preview.length).toBe(60);
    expect(result!.preview).not.toMatch(/\s{2,}|\n/);
  });

  it("keeps the canonical fingerprint for known patterns with a readable preview", () => {
    const state = { errorCount: 0, lastFingerprint: "", firstErrorTime: 0 };
    const result = checkLoop(
      sdkError("Error: Input closed while reading stdin"),
      state,
    );
    // Fatal fingerprint aborts on first occurrence
    expect(result).toEqual({
      detected: true,
      fingerprint: "input_closed",
      count: 1,
      preview: "error: input closed while reading stdin".slice(0, 60),
    });
  });

  it("extractErrorFingerprint still returns the hash string only", () => {
    expect(extractErrorFingerprint(sdkError("boom"))).toMatch(/^[0-9a-z]+$/);
    expect(extractErrorFingerprint({ type: "assistant" })).toBeNull();
  });
});


describe("extractErrorFingerprint", () => {
  it("should return null for non-error messages", () => {
    const result = extractErrorFingerprint({
      type: "user",
      message: {
        content: [{ text: "Success result", is_error: false }],
      },
    });
    expect(result).toBeNull();
  });

  it("should return fingerprint for error messages", () => {
    const result = extractErrorFingerprint({
      type: "user",
      message: {
        content: [{ text: "Error: something went wrong", is_error: true }],
      },
    });
    expect(result).not.toBeNull();
    // Unknown errors fingerprint as opaque base36 hashes (#224/#227)
    expect(result).toMatch(/^[0-9a-z]+$/);
  });

  it("should normalize known patterns", () => {
    const result = extractErrorFingerprint({
      type: "user",
      message: {
        content: [{ text: "Error: Input closed", is_error: true }],
      },
    });
    expect(result).toBe("input_closed");
  });

  it("should return null for assistant text messages", () => {
    const result = extractErrorFingerprint({
      type: "assistant",
      message: {
        content: [{ text: "I'll help you with that." }],
      },
    });
    expect(result).toBeNull();
  });

  it("should return fingerprint for tool_result with error status", () => {
    const result = extractErrorFingerprint({
      type: "tool_result",
      toolCallResult: { status: "error" },
      message: {
        parts: [{ functionResponse: { response: { error: "Command failed" } } }],
      },
    });
    expect(result).not.toBeNull();
  });
});

describe("checkLoop", () => {
  const createFreshState = (): LoopState => ({
    errorCount: 0,
    lastFingerprint: "",
    firstErrorTime: 0,
  });

  it("should not detect loop on first error", () => {
    const state = createFreshState();
    const result = checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    expect(result).toBeNull();
    expect(state.errorCount).toBe(1);
  });

  it("should detect loop after threshold errors with same fingerprint", () => {
    const state = createFreshState();
    const errorMsg = {
      type: "user",
      message: {
        content: [{ text: "Error: test failure", is_error: true }],
      },
    };

    // First error
    checkLoop(errorMsg, state);
    expect(state.errorCount).toBe(1);

    // Second error
    checkLoop(errorMsg, state);
    expect(state.errorCount).toBe(2);

    // Third error - should trigger loop detection
    const result = checkLoop(errorMsg, state);
    expect(result).not.toBeNull();
    expect(result?.detected).toBe(true);
    expect(result?.count).toBe(3);
  });

  it("should reset counter on different error fingerprint", () => {
    const state = createFreshState();

    // First error
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(1);

    // Different error - should reset counter
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: different failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(1);
    expect(state.lastFingerprint).toMatch(/^[0-9a-z]+$/);
  });

  it("should immediately detect fatal fingerprint (input_closed)", () => {
    const state = createFreshState();
    const result = checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: Input closed", is_error: true }],
        },
      },
      state
    );
    expect(result).not.toBeNull();
    expect(result?.detected).toBe(true);
  });
});

describe("checkLoop - successful tool result resets counter", () => {
  const createFreshState = (): LoopState => ({
    errorCount: 0,
    lastFingerprint: "",
    firstErrorTime: 0,
  });

  it("should reset counter on successful SDK format tool result", () => {
    const state = createFreshState();

    // Build up some error count
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(2);

    // Successful tool result should reset counter
    const result = checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "File edited successfully", is_error: false }],
        },
      },
      state
    );
    expect(result).toBeNull();
    expect(state.errorCount).toBe(0);
    expect(state.lastFingerprint).toBe("");
  });

  it("should reset counter on successful tool_result with status success", () => {
    const state = createFreshState();

    // Build up some error count
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(1);

    // Successful tool result (session log format)
    const result = checkLoop(
      {
        type: "tool_result",
        toolCallResult: { status: "success" },
      },
      state
    );
    expect(result).toBeNull();
    expect(state.errorCount).toBe(0);
  });

  it("should reset counter on successful tool_result with exitCode 0", () => {
    const state = createFreshState();

    // Build up some error count
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(1);

    // Successful tool result with exitCode 0
    const result = checkLoop(
      {
        type: "tool_result",
        toolCallResult: { status: "success", exitCode: 0 },
      },
      state
    );
    expect(result).toBeNull();
    expect(state.errorCount).toBe(0);
  });

  it("should NOT reset counter for plain text messages without is_error flag", () => {
    const state = createFreshState();

    // Build up some error count
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(1);

    // Plain text message (no is_error flag) should NOT reset counter
    const result = checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "I'm thinking about this problem..." }],
        },
      },
      state
    );
    expect(result).toBeNull();
    // Counter should remain the same since this is not a successful tool result
    expect(state.errorCount).toBe(1);
  });

  it("should NOT reset counter for assistant thinking messages", () => {
    const state = createFreshState();

    // Build up some error count
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(1);

    // Assistant thinking message should NOT reset counter
    const result = checkLoop(
      {
        type: "assistant",
        message: {
          content: [{ text: "Let me analyze the error..." }],
        },
      },
      state
    );
    expect(result).toBeNull();
    expect(state.errorCount).toBe(1);
  });

  it("should allow iterative workflow: error, success, error without false positive", () => {
    const state = createFreshState();

    // First error (e.g., test failure)
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: test failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(1);

    // Success (e.g., edit_file succeeds)
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "File edited successfully", is_error: false }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(0);

    // Different error (e.g., different test failure)
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Error: another test failure", is_error: true }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(1);

    // Another success
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Another fix applied", is_error: false }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(0);

    // Final test pass
    checkLoop(
      {
        type: "user",
        message: {
          content: [{ text: "Tests passed", is_error: false }],
        },
      },
      state
    );
    expect(state.errorCount).toBe(0);

    // No loop should have been detected
    expect(state.errorCount).toBe(0);
  });

  it("should still detect true loops with same error repeated", () => {
    const state = createFreshState();
    const errorMsg = {
      type: "user",
      message: {
        content: [{ text: "Error: permission denied", is_error: true }],
      },
    };

    // Three same errors without any success should trigger loop
    checkLoop(errorMsg, state);
    checkLoop(errorMsg, state);
    const result = checkLoop(errorMsg, state);

    expect(result).not.toBeNull();
    expect(result?.detected).toBe(true);
  });
});