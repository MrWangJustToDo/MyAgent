/**
 * The one definition of "a path written the POSIX way".
 *
 * Paths arrive from three places that disagree about separators — a `CoreEnv` on Windows, git
 * output, and stored session data written by either — so comparing or displaying them requires
 * folding `\` onto `/` first. That substitution used to be spelled at seventeen call sites, two
 * of which had already wrapped it in a private helper of their own and two more pointed at the
 * others in comments instead of calling them. A validator now rejects a new inline copy; see
 * `packages/app/scripts/validate-no-inline-path-normalization.mjs`.
 *
 * **Why `\` → `/` and not `CoreEnv.path.normalize`.** `normalize` delegates to `pathe`, which on
 * a POSIX host leaves `\` alone: there it is a legal filename byte, so a Windows-shaped input is
 * not folded at all. The conversion has to be a literal rule, not a host-dependent one — the
 * Windows-shaped case is reachable and testable on Linux, which is why these rules have
 * regression tests rather than a branch nobody can exercise.
 */

/**
 * Convert backslash separators to forward slashes.
 *
 * Changes separators and nothing else: no `..` resolution, no root stripping, no trailing
 * separator removal. Callers that need those keep doing them.
 *
 * @example toPosixPath("src\\utils\\a.ts") // "src/utils/a.ts"
 */
export const toPosixPath = (p: string): string => p.replace(/\\/g, "/");

/**
 * {@link toPosixPath}, then strip trailing separators — the form to use as a map key.
 *
 * Composed from {@link toPosixPath} on purpose rather than written as its own substitution, so
 * the rule has a single origin even though there are two entry points. `"/"` and `""` both
 * normalize to `""`, which is what makes a root path and a directory path compare equal.
 *
 * @example toPosixPathKey("C:\\repo\\") // "C:/repo"
 */
export const toPosixPathKey = (p: string): string => toPosixPath(p).replace(/\/+$/, "");
