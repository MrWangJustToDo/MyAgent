import type { Sandbox } from "../../../environment";

/** Default command timeout in ms */
export const SEARCH_COMMAND_TIMEOUT = 30_000;

/** Directories excluded from grep/glob searches */
export const DEFAULT_EXCLUDE_DIRS = ["node_modules", ".git", "dist", "coverage", ".cache", ".next", ".output"];

/** Exit code when the shell cannot find the command binary */
const COMMAND_NOT_FOUND = 127;

/**
 * Run the primary search command; fall back when the binary is missing (exit 127).
 */
export async function runSearchCommand(
  sandbox: Sandbox,
  primary: string,
  fallback: string,
  timeout = SEARCH_COMMAND_TIMEOUT
): Promise<string> {
  const primaryResult = await sandbox.runCommand(primary, { timeout });
  if (primaryResult.exitCode === COMMAND_NOT_FOUND) {
    const fallbackResult = await sandbox.runCommand(fallback, { timeout });
    return fallbackResult.stdout;
  }
  return primaryResult.stdout;
}
