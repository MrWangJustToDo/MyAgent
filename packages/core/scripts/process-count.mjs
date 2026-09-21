/**
 * Cross-platform observation of mock LSP server processes.
 *
 * The LSP validators assert that spawned language-server children are reaped — "after
 * shutdown, no mock server processes remain". On POSIX they count with `pgrep -f`.
 *
 * `pgrep` does not exist on Windows, and the original call sites swallowed its absence with
 * `catch { return 0 }`. That is the worst possible default here: **zero is exactly the value
 * that means "all children gone"**, so the assertion passed without observing anything. The
 * same collapse produced the opposite bug when `pgrep` ran but `node` was unresolvable: a
 * genuine failure was reported as `lsp_diagnostics lazy-starts mock server` — a message that
 * names the wrong thing entirely.
 *
 * So this module never guesses. {@link countMockProcesses} returns `null` for "cannot
 * observe", and callers must treat `null` as a skip. `skipped` is not `passed`: a run on a
 * platform that cannot count processes must say so rather than report a green assertion that
 * never ran.
 */

import { execFileSync } from "node:child_process";

/** Marker the suite reads to report a skip instead of a pass. Keep in sync with the runner. */
export const SKIP_MARKER = "[validator-skip]";

const IS_WINDOWS = process.platform === "win32";

/** Whether this platform can enumerate processes reliably. */
export function canObserveProcesses() {
  return !IS_WINDOWS;
}

/**
 * Count running mock-server processes matching `pattern`.
 *
 * @returns the count, or `null` when processes cannot be observed. `null` MUST NOT be
 *   treated as 0 — 0 is a real result meaning "none running".
 */
export function countMockProcesses(pattern = "mock-lsp-server\\.mjs") {
  if (!canObserveProcesses()) return null;
  try {
    // `pgrep -f` also matches its own command line, so anchor on a node invocation.
    const out = execFileSync("pgrep", ["-f", `node.*${pattern}$`], { encoding: "utf-8" });
    return out.trim().split("\n").filter(Boolean).length;
  } catch (error) {
    // pgrep exits 1 for "no match" — that is a real 0, not a failure to observe.
    if (error?.status === 1) return 0;
    // Anything else (ENOENT, unreadable /proc) means we cannot see, which is not 0.
    return null;
  }
}

/**
 * Count mock-server processes, emitting the shared skip notice when this machine cannot
 * observe them.
 *
 * Prefer this over {@link countMockProcesses} in validators: the notice is what makes the
 * skip visible to the suite. Gating on the platform alone is not enough — a Linux machine
 * without `pgrep` on PATH cannot observe either, and skipping there must be just as loud.
 *
 * @returns the count, or `null` when a caller must assert nothing.
 */
export function observeMockProcesses(pattern = "mock-lsp-server\\.mjs", context = "mock-server reaping") {
  const count = countMockProcesses(pattern);
  if (count === null) {
    console.log(
      `${SKIP_MARKER} process enumeration unavailable on ${process.platform} — ` +
        `${context} cannot be asserted and will be skipped`
    );
  }
  return count;
}
