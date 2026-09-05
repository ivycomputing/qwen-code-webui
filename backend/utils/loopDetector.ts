/**
 * Backend-side loop detection for CLI subprocess output.
 *
 * Detects repeated error patterns in SDK messages and aborts the CLI process
 * before it enters an infinite loop. This is a failsafe — the frontend also
 * has loop detection, but if it fails (e.g. status:"cancelled" bypass), the
 * backend catches it here.
 *
 * Two-tier detection:
 * 1. Known patterns (case-insensitive regex) → normalized to canonical fingerprint
 * 2. Generic detection → any repeated error content triggers loop
 */

const LOOP_ERROR_PATTERNS: [string, RegExp][] = [
  ["input_closed", /input\s+closed/i],
  ["input_closed", /operation\s+cancelled.*input\s+closed/i],
  ["permission_denied", /permission denied/i],
  ["proactive_denied", /denied this tool call.*proactive/i],
  ["stdin_closed", /stdin.*closed/i],
];

/**
 * Simple hash function (djb2 algorithm) for fingerprint generation.
 * Returns a base36 string for compact representation.
 * This fixes #224 where 200-char truncation caused false loop detection.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Check if an SDK message represents a successful tool result.
 * Returns true only for tool results that are explicitly successful
 * (is_error === false, success status, or exitCode 0).
 *
 * This is used to reset the loop detection counter when the AI makes
 * progress in an iterative workflow (e.g., edit_file succeeds after
 * a failed test run).
 */
function isSuccessfulToolResult(sdkMessage: unknown): boolean {
  const msg = sdkMessage as Record<string, unknown>;

  // SDK format: type "user", content at msg.message.content[]
  if (msg.type === "user") {
    const message = msg.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (Array.isArray(content)) {
      for (const item of content as Array<Record<string, unknown>>) {
        // Only recognize as success if is_error is EXPLICITLY false
        // This avoids misidentifying plain text messages (where is_error is undefined)
        if (item.is_error === false && (item.text !== undefined || item.content !== undefined)) {
          return true;
        }
      }
    }
    // Fallback: cannot determine, conservatively do not reset
    return false;
  }

  // Session log format: type "tool_result", toolCallResult.status or exitCode
  if (msg.type === "tool_result" && msg.toolCallResult) {
    const result = msg.toolCallResult as Record<string, unknown>;
    const status = result.status;
    const exitCode = result.exitCode;
    return status === "success" || exitCode === 0;
  }

  return false;
}

/**
 * Extract an error fingerprint from an SDK message.
 * Returns null if the message is not an error.
 *
 * Known patterns are normalized to a canonical name (e.g. "input_closed").
 * Unknown errors use a hash of the full normalized content (#224).
 *
 * CLI stdout format (local): type "user", error at msg.message.content[].content, is_error: true
 * Session log format (remote): type "tool_result", error at msg.message.parts[].functionResponse.response.error
 */
export function extractErrorFingerprint(sdkMessage: unknown): string | null {
  return extractError(sdkMessage)?.fingerprint ?? null;
}

/**
 * Extract the fingerprint plus a short snippet of the normalized error content.
 * The snippet keeps logs readable now that unknown errors surface as opaque
 * hashes (#224).
 */
function extractError(
  sdkMessage: unknown,
): { fingerprint: string; preview: string } | null {
  const msg = sdkMessage as Record<string, unknown>;
  let errorContent: string | null = null;

  // SDK format (local): type "user", content at msg.message.content[]
  if (msg.type === "user") {
    const message = msg.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (Array.isArray(content)) {
      for (const item of content as Array<Record<string, unknown>>) {
        if (item.is_error) {
          errorContent = String(item.text ?? item.content ?? "");
          break;
        }
      }
    }
    // Fallback: flat content (some SDK versions)
    if (!errorContent && Array.isArray(msg.content)) {
      for (const item of msg.content as Array<Record<string, unknown>>) {
        if (item.is_error) {
          errorContent = String(item.text ?? item.content ?? "");
          break;
        }
      }
    }
  }

  // Session log format (remote): type "tool_result", toolCallResult.status
  if (msg.type === "tool_result" && msg.toolCallResult) {
    const status = (msg.toolCallResult as Record<string, unknown>).status;
    if (status === "error" || status === "cancelled") {
      const message = msg.message as Record<string, unknown> | undefined;
      if (message?.parts && Array.isArray(message.parts)) {
        for (const part of message.parts as Array<Record<string, unknown>>) {
          const fr = part.functionResponse as
            | Record<string, unknown>
            | undefined;
          if (fr?.response) {
            const resp = fr.response as Record<string, unknown>;
            errorContent = String(resp.error ?? resp.output ?? "");
            break;
          }
        }
      }
      if (!errorContent) {
        errorContent = String(status);
      }
    }
  }

  if (!errorContent) return null;

  // Known patterns are matched on the raw content; unknown errors hash the
  // full normalized content (#224) — the preview is only for log readability.
  const lower = errorContent.toLowerCase();
  const normalized = lower.replace(/\s+/g, " ").trim();
  const preview = normalized.slice(0, 60);

  // Check known patterns first — normalize to canonical name
  for (const [name, pattern] of LOOP_ERROR_PATTERNS) {
    if (pattern.test(lower)) return { fingerprint: name, preview };
  }

  // Unknown error — use full content hash (#224)
  return { fingerprint: simpleHash(normalized), preview };
}

export interface LoopState {
  errorCount: number;
  lastFingerprint: string;
  firstErrorTime: number;
}

const DEFAULT_THRESHOLD = 3;
const LOOP_WINDOW_MS = 300_000; // 5 minutes

/** Fatal fingerprints — always abort on first occurrence (no recovery possible) */
const FATAL_FINGERPRINTS = new Set(["input_closed"]);

/**
 * Whether a fingerprint is a session-fatal error. Fatal detection must stay
 * active even when non-fatal loop detection is bypassed (e.g. YOLO mode) —
 * the CLI process is dead and further iteration is pointless.
 */
export function isFatalFingerprint(fingerprint: string): boolean {
  return FATAL_FINGERPRINTS.has(fingerprint);
}

/**
 * Check if an SDK message indicates a loop.
 * Returns loop info if detected, null otherwise.
 * State is maintained by the caller (simple object, reset per request).
 *
 * Successful tool results reset the counter (indicates workflow progress).
 * Non-error non-tool messages (assistant text, system) do NOT reset the counter.
 * Only a different error fingerprint or an expired time window resets it.
 */
export function checkLoop(
  sdkMessage: unknown,
  state: LoopState,
  threshold: number = DEFAULT_THRESHOLD,
): { detected: true; fingerprint: string; count: number; preview: string } | null {
  const error = extractError(sdkMessage);

  if (!error) {
    // A successful tool result indicates workflow progress — reset the
    // counter (#225). Other non-error messages (assistant text, system) do
    // NOT reset: in a real loop, error messages are interleaved with
    // assistant messages, so resetting on non-errors would prevent detection.
    if (isSuccessfulToolResult(sdkMessage)) {
      state.errorCount = 0;
      state.lastFingerprint = "";
      state.firstErrorTime = 0;
    }
    return null;
  }
  const { fingerprint } = error;

  const effectiveThreshold = FATAL_FINGERPRINTS.has(fingerprint) ? 1 : threshold;
  const now = Date.now();

  // Reset if different fingerprint or time window expired
  if (
    fingerprint !== state.lastFingerprint ||
    now - state.firstErrorTime > LOOP_WINDOW_MS
  ) {
    state.errorCount = 1;
    state.lastFingerprint = fingerprint;
    state.firstErrorTime = now;
  } else {
    state.errorCount++;
  }

  if (state.errorCount >= effectiveThreshold) {
    return { detected: true, fingerprint, count: state.errorCount, preview: error.preview };
  }

  return null;
}
