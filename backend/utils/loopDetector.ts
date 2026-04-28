/**
 * Backend-side loop detection for CLI subprocess output.
 *
 * Detects repeated error patterns in SDK messages and aborts the CLI process
 * before it enters an infinite loop. This is a failsafe — the frontend also
 * has loop detection, but if it fails (e.g., status:"cancelled" bypass), the
 * backend catches it here.
 *
 * Two-tier detection:
 * 1. Known patterns (case-insensitive regex) → normalized to canonical fingerprint
 * 2. Generic detection → any repeated error content triggers loop
 */

const LOOP_ERROR_PATTERNS: [string, RegExp][] = [
  ["input_closed", /input\s+closed/i],
  ["input_closed", /operation\s+cancelled/i],
  ["permission_denied", /permission denied/i],
  ["stdin_closed", /stdin.*closed/i],
];

const MAX_FINGERPRINT_LEN = 200;

/**
 * Extract an error fingerprint from an SDK message.
 * Returns null if the message is not an error.
 *
 * Known patterns are normalized to a canonical name (e.g. "input_closed").
 * Unknown errors use lowercased content as fingerprint.
 *
 * CLI stdout format (local): type "user", error at msg.message.content[].content, is_error: true
 * Session log format (remote): type "tool_result", error at msg.message.parts[].functionResponse.response.error
 */
export function extractErrorFingerprint(sdkMessage: unknown): string | null {
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

  // Check known patterns first — normalize to canonical name
  const lower = errorContent.toLowerCase();
  for (const [name, pattern] of LOOP_ERROR_PATTERNS) {
    if (pattern.test(lower)) return name;
  }

  // Unknown error — use content fingerprint
  return lower.substring(0, MAX_FINGERPRINT_LEN);
}

export interface LoopState {
  errorCount: number;
  lastFingerprint: string;
  firstErrorTime: number;
}

const DEFAULT_THRESHOLD = 3;
const LOOP_WINDOW_MS = 300_000; // 5 minutes

/**
 * Check if an SDK message indicates a loop.
 * Returns loop info if detected, null otherwise.
 * State is maintained by the caller (simple object, reset per request).
 *
 * Non-error messages (assistant, system, etc.) do NOT reset the counter.
 * Only a different error fingerprint or an expired time window resets it.
 */
export function checkLoop(
  sdkMessage: unknown,
  state: LoopState,
  threshold: number = DEFAULT_THRESHOLD,
): { detected: true; fingerprint: string; count: number } | null {
  const fingerprint = extractErrorFingerprint(sdkMessage);

  if (!fingerprint) {
    // Non-error message — do NOT reset counter.
    // In a real loop, error messages are interleaved with assistant messages,
    // so resetting on non-errors would prevent detection.
    return null;
  }

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

  if (state.errorCount >= threshold) {
    return { detected: true, fingerprint, count: state.errorCount };
  }

  return null;
}
