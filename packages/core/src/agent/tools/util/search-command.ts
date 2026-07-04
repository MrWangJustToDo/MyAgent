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
  // Non-zero exit with no stdout suggests the primary ran but failed for another
  // reason (bad flag, broken pipe mid-stream, etc.). Try the fallback rather than
  // returning an empty string that the caller would mistake for "no matches".
  if (primaryResult.exitCode !== 0 && primaryResult.stdout.trim() === "") {
    const fallbackResult = await env.runCommand(fallback, { timeout });
    if (fallbackResult.exitCode === 0 || fallbackResult.stdout.trim() !== "") {
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
