/**
 * Resolve a language-server command to a project-local executable when one exists.
 *
 * A devDependency install (`node_modules/.bin/typescript-language-server`,
 * `node_modules/.bin/pyright-langserver`, …) is preferred over the global PATH so
 * the project's own pinned server version is used without a global install. This
 * keeps the probe (`CoreEnv.commandExists`) and the spawn in agreement: both go
 * through this resolver, so a server is never reported as "found" and then
 * spawned from a different location.
 *
 * Commands that already contain a path separator, and commands with no local
 * install, are returned unchanged and resolved by the OS via PATH.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";

/** Candidate file names for a local bin, including Windows shims. */
function candidates(command: string): string[] {
  if (process.platform !== "win32") return [command];
  return [`${command}.cmd`, `${command}.exe`, command];
}

/**
 * Resolve `command` against `<cwd>/node_modules/.bin`, falling back to the
 * command itself (PATH lookup) when there is no local install.
 */
export function resolveCommandPath(command: string, cwd: string | undefined): string {
  if (!command || command.includes("/") || command.includes("\\") || !cwd) return command;
  try {
    for (const name of candidates(command)) {
      const local = path.join(cwd, "node_modules", ".bin", name);
      if (existsSync(local)) return local;
    }
  } catch {
    // Unreadable cwd / fs probe failure — fall back to PATH.
  }
  return command;
}
