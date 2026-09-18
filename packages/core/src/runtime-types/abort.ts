/**
 * Is this error the user aborting the run, rather than a failure?
 *
 * The question has to be answered in three places that cannot share a call stack: the run
 * coordinator (did the pump stop because of an abort?), and any tool that received an
 * `abortSignal` and has to decide whether to settle as "cancelled" or to throw. Leaving each
 * one its own heuristic is how the shapes drifted apart — a tool matched
 * `ExecutionError.code === "aborted"`, the coordinator matched `name === "AbortError"` plus a
 * substring, and a remote CoreEnv reconstructs the error over HTTP so the class identity is
 * gone by the time it arrives. This is the one predicate for all of them.
 *
 * `signal` is checked first and is the strongest evidence: if the run's controller is already
 * aborted, the throw is the abort, whatever the error looks like. `aborted` in the message is
 * the last resort, kept because it is what the node shell throws (`throw new Error("aborted")`)
 * and because `run-coordinator` relied on it before this module existed.
 */
export function isAbortError(err: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true;
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  // A remote CoreEnv serializes `ExecutionError` as `{ name, code, message }` and rebuilds it
  // host-side; `instanceof` survives that, but the plain-object path does not, so match both.
  if ((err as { code?: unknown }).code === "aborted") return true;
  if (err.name === "ExecutionError" && (err as { code?: unknown }).code === "aborted") return true;
  return err.message === "aborted";
}

/**
 * A settled-tool output carrying the user-cancel marker, for either of the two shapes the
 * codebase writes: `cancelled` (what a tool sets when it caught its own abort) and `aborted`
 * (what the `task` tool sets, because its subagent cancels instead of throwing).
 */
export function isCancelledOutputMarker(output: unknown): boolean {
  if (typeof output !== "object" || output === null) return false;
  return (output as { cancelled?: boolean }).cancelled === true || (output as { aborted?: boolean }).aborted === true;
}
