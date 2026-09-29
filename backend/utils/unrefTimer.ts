/**
 * Cross-runtime timer helper.
 *
 * Node typings give setTimeout() a NodeJS.Timeout with unref(); Deno's lib
 * configuration types it as a plain number, so touching `.unref` directly is
 * a TS2339 in shared code (the remaining baseline errors noted in #277).
 * This helper performs the feature check behind a cast instead, keeping both
 * runtimes happy at the type level.
 */

type MaybeUnrefable = ReturnType<typeof setTimeout> & {
  unref?: () => void;
};

export function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  (timer as MaybeUnrefable).unref?.();
}
