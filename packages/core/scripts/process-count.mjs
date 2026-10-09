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
 *
 * The pattern requires a path separator before `mock-lsp-server.mjs`, NOT the bare script name.
 * The LSP validators run concurrently (the suite's default concurrency is 4), and
 * `slow-mock-lsp-server.mjs` also ends in `mock-lsp-server.mjs`, so an unanchored
 * `node.*mock-lsp-server\.mjs$` counted a *slow* validator's child as one of ours (its basename
 * is `slow-mock-...`, so the `/` before `mock` is not present). That is exactly the
 * contamination the baseline in `validate-lsp-lifecycle` exists to reject: an unrelated child
 * inflated the baseline, and when it exited (after its 2 s handshake, or a real session:start
 * teardown) the count fell *below* the frozen baseline — reported as the self-contradictory
 * `-1 left (baseline 1)`. `cwd` does not discriminate (every validator runs from the same
 * `scripts/` dir), so the pattern requires a path separator before the basename and — for a
 * count that has to mean "this run's children" at all — a per-run argv marker.
 *
 * The marker is the real fix, and the separator is not enough on its own: two validators spawning
 * the *fast* server at once are indistinguishable by name, so a baseline taken while a concurrent
 * peer's child is alive goes stale the same way (reproduced: four concurrent
 * `validate-lsp-lifecycle` runs reported `-2 left (baseline 2)`). {@link createMockServerCounter}
 * therefore appends a random tag to the spawned server's argv and matches on it, so only this
 * run's children are ever counted. Both mocks read stdin only, so the extra argv is inert.
 */

import { execFileSync } from "node:child_process";

/** Marker the suite reads to report a skip instead of a pass. Keep in sync with the runner. */
export const SKIP_MARKER = "[validator-skip]";

const IS_WINDOWS = process.platform === "win32";

/**
 * Process-name pattern for the fast mock server, anchored on a path separator before the basename.
 *
 * The separator is what keeps it off `slow-mock-lsp-server.mjs`; do not relax it to a bare
 * `mock-lsp-server\\.mjs$` (see the module docblock).
 */
export const MOCK_SERVER_PATTERN = "[/\\\\]mock-lsp-server\\.mjs$";

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
export function countMockProcesses(pattern = MOCK_SERVER_PATTERN) {
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
export function observeMockProcesses(pattern = MOCK_SERVER_PATTERN, context = "mock-server reaping") {
  const count = countMockProcesses(pattern);
  if (count === null) {
    console.log(
      `${SKIP_MARKER} process enumeration unavailable on ${process.platform} — ` +
        `${context} cannot be asserted and will be skipped`
    );
  }
  return count;
}

// ============================================================================
// Per-run isolation
// ============================================================================

/** Argv flag appended to a mock server's args so only this run's children match. */
export const MOCK_SERVER_TAG_FLAG = "--codent-validator-tag";

/** Regex-escape a literal for use inside the pgrep pattern. */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A per-run counter for the mock servers one validator spawns.
 *
 * `pgrep` can only see a command line, and every LSP validator spawns the same
 * `node .../mock-lsp-server.mjs` child — so a global count mixes concurrent runs together (the
 * suite runs several validators at once). The count is scoped by an argv marker that
 * {@link MockServerCounter.getTagArgs} appends to the spawned server's args, which is what makes a
 * baseline mean "this run's children".
 *
 * @param name short scope for the tag, e.g. `"lsp-lifecycle"`
 * @param basename the spawned server script's basename (`slow-mock-lsp-server.mjs` for the slow one)
 */
export function createMockServerCounter(name, basename = "mock-lsp-server.mjs") {
  const tag = `${name}-${process.pid.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // Leading `node` keeps `pgrep -f` off the validator's own command line; the trailing anchor
  // requires the tag to be the last argument, which is where `tagArgs` puts it.
  const pattern = `node.*${escapeRegex(basename)}.*${escapeRegex(MOCK_SERVER_TAG_FLAG)} ${escapeRegex(tag)}$`;
  return {
    tag,
    /** Args to append after the server script path in the host's server config. */
    getTagArgs: () => [MOCK_SERVER_TAG_FLAG, tag],
    /** Count this run's mock servers (`null` when the platform cannot observe processes). */
    count: () => countMockProcesses(pattern),
    /** Count with the shared skip notice, as {@link observeMockProcesses} does. */
    observe: (context = `${name} mock-server reaping`) => observeMockProcesses(pattern, context),
  };
}
