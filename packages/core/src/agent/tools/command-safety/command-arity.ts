/**
 * Command arity normalization — map a command's tokens to a normalized
 * "command + subcommand" prefix (e.g. `git checkout main` → `git checkout`).
 *
 * Ported (subset) from opencode's `permission/arity.ts`: each entry maps a
 * leading command prefix to the number of leading tokens to keep; longer
 * prefixes win (longest match first), so flags and extra arguments are
 * dropped. Pure functions — no runtime dependencies.
 */

/**
 * Leading command prefix → number of tokens to keep.
 *
 * `npm` → 2 keeps `npm install`, `npm exec ...` → 3 keeps `npm exec vite`.
 * Flags are never counted: they follow the normalized prefix.
 */
const ARITY: Record<string, number> = {
  // Single-command tools (arity 1 — the bare command is the normalized prefix).
  cat: 1,
  cd: 1,
  chmod: 1,
  chown: 1,
  cp: 1,
  dirname: 1,
  echo: 1,
  env: 1,
  find: 1,
  git: 2,
  "git config": 3,
  "git remote": 3,
  "git stash": 3,
  go: 2,
  grep: 1,
  head: 1,
  kill: 1,
  ls: 1,
  make: 2,
  mkdir: 1,
  mv: 1,
  node: 2,
  npm: 2,
  "npm exec": 3,
  "npm init": 3,
  "npm run": 3,
  "npm view": 3,
  pnpm: 2,
  "pnpm dlx": 3,
  "pnpm exec": 3,
  "pnpm run": 3,
  printf: 1,
  ps: 1,
  pwd: 1,
  python: 2,
  "python -m": 3,
  rm: 1,
  rmdir: 1,
  sed: 1,
  sort: 1,
  tail: 1,
  touch: 1,
  uname: 1,
  wc: 1,
  which: 1,
  yarn: 2,
  "yarn dlx": 3,
  "yarn run": 3,
};

/**
 * Normalize a command's tokens into its command + subcommand prefix.
 *
 * Mirrors opencode's `BashArity.prefix`: tries the longest leading prefix
 * that exists in {@link ARITY} and keeps that many tokens; falls back to the
 * first token (the command name itself).
 */
export function commandPrefix(tokens: string[]): string[] {
  for (let len = Math.min(tokens.length, 8); len > 0; len--) {
    const prefix = tokens.slice(0, len).join(" ");
    const arity = ARITY[prefix];
    if (arity !== undefined) {
      return tokens.slice(0, arity);
    }
  }
  if (tokens.length === 0) return [];
  return tokens.slice(0, 1);
}

/** Normalized prefix joined as a string (e.g. `"git status"`). */
export function normalizedCommand(tokens: string[]): string {
  return commandPrefix(tokens).join(" ");
}

/** The raw command name (first token, lowercased). */
export function commandName(tokens: string[]): string {
  return tokens[0]?.toLowerCase() ?? "";
}
