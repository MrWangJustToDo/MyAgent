import { getEnv } from "../../../env.js";

/** Default command timeout in ms */
export const SEARCH_COMMAND_TIMEOUT = 30_000;

/** Directories excluded from grep/glob searches */
export const DEFAULT_EXCLUDE_DIRS = ["node_modules", ".git", "dist", "coverage", ".cache", ".next", ".output"];

/** Exit code when the shell cannot find the command binary */
const COMMAND_NOT_FOUND = 127;

/**
 * Run the primary search command; fall back when the binary is missing (exit 127).
 *
 * Also falls back when the primary command exits non-zero with empty stdout —
 * this covers cases like `rg` failing for a reason other than binary-not-found
 * (e.g. an unsupported flag on an older build) so the search is not silently
 * treated as "no matches". If both primary and fallback fail, both stderrs are
 * surfaced via a thrown error for debuggability.
 */
export async function runSearchCommand(
  primary: string,
  fallback: string,
  timeout = SEARCH_COMMAND_TIMEOUT
): Promise<string> {
  const env = getEnv();
  const primaryResult = await env.runCommand(primary, { timeout });
  if (primaryResult.exitCode === COMMAND_NOT_FOUND) {
    const fallbackResult = await env.runCommand(fallback, { timeout });
    return fallbackResult.stdout;
  }
  // rg/grep exit 1 means "no matches found" — a legitimate empty result, not a
  // failure. Return the (empty) stdout so the caller presents 0 matches instead
  // of a bogus "Search command failed" error.
  if (primaryResult.exitCode === 1) {
    return primaryResult.stdout;
  }
  // Other non-zero exits with no stdout suggest the primary ran but failed for
  // another reason (bad flag, broken pipe mid-stream, IO error, etc.). Try the
  // fallback rather than returning an empty string that the caller would mistake
  // for "no matches". If both primary and fallback fail, both stderrs are
  // surfaced via a thrown error for debuggability.
  if (primaryResult.exitCode !== 0 && primaryResult.stdout.trim() === "") {
    const fallbackResult = await env.runCommand(fallback, { timeout });
    // exit 0 = matches found; exit 1 = no matches (still a valid empty result).
    if (fallbackResult.exitCode === 0 || fallbackResult.exitCode === 1 || fallbackResult.stdout.trim() !== "") {
      return fallbackResult.stdout;
    }
    // Both failed — surface both stderrs so the failure is diagnosable.
    throw new Error(
      `Search command failed.\n` +
        `primary (exit ${primaryResult.exitCode}): ${primaryResult.stderr.trim() || "<no stderr>"}\n` +
        `fallback (exit ${fallbackResult.exitCode}): ${fallbackResult.stderr.trim() || "<no stderr>"}`
    );
  }
  return primaryResult.stdout;
}
