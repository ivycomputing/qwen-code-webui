/**
 * Stream stall detector — aborts a fetch when no data arrives for a configurable
 * timeout. Handles browser background-tab throttling and system sleep/wake by
 * tracking `lastDataTime` and only aborting when the tab is visible.
 */

export interface StallDetector {
  /** Call every time data is received (including keepalive bytes). */
  onData: () => void;
  /** Clean up timers and event listeners. */
  dispose: () => void;
}

export function createStallDetector(
  abortController: AbortController,
  timeoutMs?: number,
): StallDetector {
  // Allow override via VITE_STALL_TIMEOUT_MS environment variable (in milliseconds)
  // Default: 60 seconds = 60000 ms
  const effectiveTimeoutMs = timeoutMs ?? 
    (import.meta.env.VITE_STALL_TIMEOUT_MS 
      ? parseInt(import.meta.env.VITE_STALL_TIMEOUT_MS, 10) 
      : 60_000);
  let stallTimerId: ReturnType<typeof setTimeout> | null = null;
  let lastDataTime = Date.now();

  const scheduleCheck = () => {
    if (stallTimerId) clearTimeout(stallTimerId);
    stallTimerId = setTimeout(onTimeout, effectiveTimeoutMs);
  };

  const onTimeout = () => {
    // Tab hidden → browser throttles reader.read() delivery; re-schedule.
    if (document.hidden) {
      stallTimerId = setTimeout(onTimeout, effectiveTimeoutMs);
      return;
    }
    // Tab visible but not enough time has actually elapsed (e.g. woke from
    // sleep during a re-scheduled check) — wait the remaining time.
    const elapsed = Date.now() - lastDataTime;
    if (elapsed < effectiveTimeoutMs) {
      stallTimerId = setTimeout(onTimeout, effectiveTimeoutMs - elapsed);
      return;
    }
    console.warn(`[Stream stall] No data for ${effectiveTimeoutMs / 1000}s, aborting fetch`);
    abortController.abort();
  };

  const onData = () => {
    lastDataTime = Date.now();
    scheduleCheck();
  };

  const onVisibilityChange = () => {
    if (!document.hidden) onData();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);

  // Start the initial timer.
  scheduleCheck();

  return {
    onData,
    dispose: () => {
      if (stallTimerId) {
        clearTimeout(stallTimerId);
        stallTimerId = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
