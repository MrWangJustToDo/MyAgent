/**
 * Wall-clock start of this CLI run, for the exit summary's duration.
 *
 * Recorded at module load, which is the earliest point the process can name — boot happens
 * before any session exists, so it includes the startup work the user waited through. That is
 * the reading a "session duration" line promises here: Claude Code prints both an API and a
 * wall duration, and this is the wall one (the API one is `usage.llmDurationMs`).
 *
 * Module scope rather than a mount effect on purpose. The value has to survive whatever
 * re-renders or remounts the app does between boot and exit, and the only alternative that is
 * still correct at exit — threading it through the session snapshot — would mean adding a field
 * to the persisted session shape for a number that is only ever read on the way out.
 */
const cliStartedAt = Date.now();

/** Milliseconds since this CLI process started. */
export function getCliElapsedMs(now: number = Date.now()): number {
  return Math.max(0, now - cliStartedAt);
}
