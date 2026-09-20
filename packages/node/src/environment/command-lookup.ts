/**
 * Bare-command resolution without a shell.
 *
 * Exists because `CoreEnv.commandExists` used to probe with
 * `command -v "<cmd>" >/dev/null 2>&1`. That builtin does not exist in PowerShell or
 * cmd.exe, so on Windows the probe reported *every* binary as missing — the LSP extension
 * then skipped language servers that were installed, and the search tools' fallback logic
 * could never engage.
 *
 * Scanning `PATH` directly is shell-agnostic and needs no process spawn. On Windows it is
 * also what a spawn requires: `CreateProcess` resolves a bare name against `PATH` only when
 * the caller passes search semantics, so an explicit resolution avoids relying on that.
 */

import { accessSync, constants, existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Default `PATHEXT` when the variable is unset (matches cmd.exe's own default). */
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

/**
 * Filenames to try for `command`, honouring Windows executable extensions.
 *
 * The exact name is tried first, so an extensionless binary still resolves on Windows when
 * present — Git Bash ships several (`bash`, `sh`) with no extension.
 *
 * @param command - Bare command name (callers must not pass a path).
 * @param isWindows - Whether to append `PATHEXT` variants.
 * @param pathExt - Override for `PATHEXT`; defaults to `process.env.PATHEXT`.
 */
export function commandFileCandidates(command: string, isWindows: boolean, pathExt?: string | undefined): string[] {
  if (!isWindows) return [command];
  const raw = pathExt ?? process.env.PATHEXT ?? DEFAULT_PATHEXT;
  const exts = raw
    .split(";")
    .map((ext) => ext.trim())
    .filter(Boolean);
  const names: string[] = [command];
  for (const ext of exts) {
    // Both cases: Windows is case-insensitive but `existsSync` is not, and a binary may sit
    // on disk as `RG.EXE` or `rg.exe`.
    names.push(`${command}${ext.toLowerCase()}`);
    names.push(`${command}${ext.toUpperCase()}`);
  }
  return names;
}

/**
 * Split a `PATH`-style variable into directories.
 *
 * Uses `;` on Windows and `:` elsewhere. `Path` is checked as well as `PATH` because Windows
 * environment variables are case-insensitive and both spellings occur in practice.
 */
export function pathDirs(env: NodeJS.ProcessEnv = process.env, isWindows = os.platform() === "win32"): string[] {
  const value = env.PATH ?? env.Path ?? "";
  return value.split(isWindows ? ";" : ":").filter(Boolean);
}

/**
 * Resolve a bare command against `PATH`.
 *
 * @returns The resolved path, or `undefined` when nothing matches.
 *
 * Executability is checked on POSIX (`X_OK`). Merely existing is not enough: a file on `PATH`
 * without the execute bit cannot be spawned, so reporting it as available defers the failure to
 * the spawn site — which for the LSP path means a server that looks installed and then dies.
 * (The previous `command -v` probe happened to agree, because it resolved only executables; the
 * direct-`PATH` rewrite dropped the property, so this restores it explicitly rather than relying
 * on a shell's opinion.)
 *
 * On Windows there is no execute bit to consult (`X_OK` is a no-op on the file mode), and adding
 * a `.exe`-style extension check here would be less accurate than the `PATHEXT` expansion that
 * already decided the candidate name, so executability is taken from the name.
 */
export function scanPathForCommand(
  command: string,
  options: {
    env?: NodeJS.ProcessEnv;
    isWindows?: boolean;
    exists?: (p: string) => boolean;
    isExecutable?: (p: string) => boolean;
  } = {}
): string | undefined {
  if (!command) return undefined;
  const isWindows = options.isWindows ?? os.platform() === "win32";
  const exists = options.exists ?? existsSync;
  // Injectable for the same reason as `exists`: a Windows-shaped lookup must be testable on Linux.
  const isExecutable =
    options.isExecutable ??
    (isWindows
      ? () => true
      : (p: string) => {
          try {
            accessSync(p, constants.X_OK);
            return true;
          } catch {
            return false;
          }
        });

  const usable = (candidate: string) => exists(candidate) && isExecutable(candidate);

  // Already a path — verify it as given.
  if (command.includes("/") || command.includes("\\")) {
    return usable(command) ? command : undefined;
  }

  const env = options.env ?? process.env;
  const names = commandFileCandidates(command, isWindows, env.PATHEXT);
  // Use the *target* platform's path semantics explicitly rather than `path.join`, which
  // follows the host. This keeps Windows lookup correct when running under test on Linux —
  // the alternative is Windows logic that no CI runner off-Windows can exercise, which is
  // how the original `command -v` probe rotted unnoticed.
  const joinPath = isWindows ? path.win32.join : path.posix.join;
  for (const dir of pathDirs(env, isWindows)) {
    for (const name of names) {
      const candidate = joinPath(dir, name);
      if (usable(candidate)) return candidate;
    }
  }
  return undefined;
}
