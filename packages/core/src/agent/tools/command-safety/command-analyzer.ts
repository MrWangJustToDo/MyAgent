/**
 * Command analyzer — build a structured safety report for a shell command.
 *
 * Pure functions + injected context (root/cwd/home/env/path). All runtime
 * access flows through the injected {@link CommandAnalysisContext}, which is
 * constructed from CoreEnv by {@link createAnalysisContext} — no direct
 * `process`/`os`/global access (runtime-agnostic).
 *
 * Ported from opencode (`tmp/sst-opencode/.../tool/shell.ts`): file-command
 * sets, path-arg expansion (`~`, `$VAR`, `$HOME`/`$PWD`), glob truncation,
 * and `containsPath` for project-internal/external classification. PowerShell
 * cmdlets and win32 path handling from opencode are intentionally trimmed
 * (bash-first).
 */

import { defaultPath, getEnv } from "../../../env.js";
import { toPosixPathKey } from "../../../utils/posix-path.js";

import { canonicalizeCommandName, commandName, commandPrefix } from "./command-arity.js";
import { extractCommands, parseCommandTree, resolveShellKind } from "./command-parser.js";
import { hasCommandSubstitution, tokenizeCommandString } from "./command-tokenizer.js";

import type { ParsedCommand, ShellKind } from "./command-parser.js";
import type { CoreEnvPath } from "../../../env.js";

// ============================================================================
// Types
// ============================================================================

export interface CommandAnalysisContext {
  /** Workspace root path (CoreEnv.rootPath). */
  rootPath: string;
  /** Working directory for relative path resolution. */
  cwd: string;
  /** Home directory (CoreEnv.homedir()) for `~` expansion. */
  home?: string;
  /** Environment variables (CoreEnv.getEnv()) for `$VAR` expansion. */
  env?: Record<string, string | undefined>;
  /** Path utilities (CoreEnvPath — POSIX via pathe by default). */
  path: CoreEnvPath;
  /**
   * Shell the command will run under. Resolved from the host when omitted; callers that
   * already know it should pass it so the grammar choice and the execution agree.
   */
  shellKind?: ShellKind;
}

export interface FileOpAnalysis {
  /** Command name performing the file operation. */
  op: string;
  /** Original argument as written. */
  arg: string;
  /** Resolved absolute path (empty when unresolvable). */
  resolvedPath: string;
  /** True when the resolved path is outside the project root. */
  external: boolean;
  /** True when the argument could not be statically resolved (variables/globs). */
  unresolvable?: boolean;
}

export interface CommandAnalysis {
  /** Raw argument tokens (command name first). */
  tokens: string[];
  /** Command source text. */
  source: string;
  /** Normalized command + subcommand prefix tokens. */
  prefix: string[];
  /** Normalized prefix joined (e.g. `"git status"`). */
  normalized: string;
  /** True when the command is read-only and safe to auto-approve. */
  isReadOnly: boolean;
  /** File operations detected on this command. */
  fileOps: FileOpAnalysis[];
}

export interface CommandSafetyReport {
  /** False when the command was not parsed from an AST (grammar unavailable or parse failed). */
  ok: boolean;
  /**
   * True when the target shell has no bundled grammar, so the report was built from the
   * table-driven fallback rather than an AST. Distinct from `ok: false` with `parsed: true`,
   * which means a grammar existed but the command did not parse.
   */
  grammarUnavailable?: boolean;
  commands: CommandAnalysis[];
  /** True when any file path resolves outside the project root. */
  anyExternalDir: boolean;
  /** True when any command writes the filesystem (write ops / write redirects). */
  anyWriteOp: boolean;
}

// ============================================================================
// File-command sets (opencode shell.ts FILES / CMD_FILES, bash-focused)
// ============================================================================

const CWD_COMMANDS = new Set(["cd", "chdir"]);
const READ_FILE_COMMANDS = new Set([
  "cat",
  "head",
  "tail",
  "grep",
  "find",
  "sed",
  "wc",
  "sort",
  "ls",
  // Windows-native read-only file commands
  "dir",
  "type",
  "more",
  "findstr",
]);
/** Commands that mutate the filesystem (path args are treated as write targets). */
const WRITE_OPS = new Set([
  "rm",
  "cp",
  "mv",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  // cmd.exe variants (kept for parity with opencode; not primary on bash hosts)
  "copy",
  "del",
  "erase",
  "md",
  "move",
  "rd",
  "ren",
  "rename",
  "rmdir",
]);

/** All commands whose arguments are file paths (path-external analysis applies). */
const FILE_COMMANDS = new Set([...CWD_COMMANDS, ...READ_FILE_COMMANDS, ...WRITE_OPS]);

/** Normalized prefixes that are considered read-only (safe to auto-approve). */
const READONLY_PREFIXES = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "grep",
  "find",
  "pwd",
  "echo",
  "printf",
  "wc",
  "sort",
  "which",
  "uname",
  "env",
  "dirname",
  "basename",
  "ps",
  "git status",
  "git log",
  "git diff",
  "git show",
  "git stash list",
  "git remote -v",
  "node -v",
  "node --version",
  "npm -v",
  "npm --version",
  "pnpm -v",
  "pnpm --version",
  "yarn -v",
  "yarn --version",
  "python -V",
  "python --version",

  // ---- Windows-native read-only commands ----
  // `where` is the platform counterpart of `which`; `dir`/`type`/`more`/`findstr` are the
  // read-only file commands. Grouped separately so the POSIX list stays visually intact.
  "dir",
  "type",
  "more",
  "findstr",
  "where",
  "tasklist",
]);

// ============================================================================
// Path argument expansion (opencode unquote/home/envValue/expand/prefix)
// ============================================================================

function unquote(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === '"' || first === "'") && first === last) return text.slice(1, -1);
  return text;
}

function homeExpand(text: string, ctx: CommandAnalysisContext): string {
  if (!ctx.home) return text;
  if (text === "~") return ctx.home;
  if (text.startsWith("~/") || text.startsWith("~\\")) return ctx.path.join(ctx.home, text.slice(2));
  return text;
}

function envExpand(text: string, ctx: CommandAnalysisContext): string {
  return text
    .replace(/\$\{env:([^}]+)\}/gi, (_, key: string) => ctx.env?.[key] ?? "")
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, key: string) => ctx.env?.[key] ?? "")
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key: string) => {
      if (key === "HOME") return ctx.home ?? "";
      if (key === "PWD") return ctx.cwd;
      return ctx.env?.[key] ?? "";
    });
}

/** Expand a raw argument into a concrete string (unquote → env → home). */
function expandArg(text: string, ctx: CommandAnalysisContext): string {
  return homeExpand(envExpand(unquote(text), ctx), ctx);
}

/** True when the argument cannot be statically resolved to a concrete path. */
function isDynamicArg(text: string): boolean {
  if (text.startsWith("(") || text.startsWith("@(")) return true;
  return text.includes("$(") || text.includes("${") || text.includes("`") || text.includes("$");
}

/** Truncate a path at the first glob metacharacter (`?`, `*`, `[`). */
function globPrefix(text: string): string | undefined {
  const match = /[?*[]/.exec(text);
  if (!match) return text;
  if (match.index === 0) return undefined;
  return text.slice(0, match.index);
}

/** Collect path arguments for a command, dropping flags (opencode `pathArgs`). */
function pathArgs(tokens: string[]): string[] {
  const name = tokens[0]?.toLowerCase() ?? "";
  return tokens.slice(1).filter((item) => {
    if (item.startsWith("-")) return false;
    if (name === "chmod" && item.startsWith("+")) return false;
    return true;
  });
}

/**
 * Whether `child` resolves inside `parent`.
 *
 * Both sides are compared in a canonical forward-slash form. That is deliberate: the host's
 * `path.normalize` and its separator can disagree — `pathe` normalizes `C:\repo` to `C:/repo`
 * while reporting `\` as its separator — so building a prefix from a normalized path and a
 * separator of a different flavour produced a false "outside the root" verdict for Windows
 * paths. Comparing in one canonical form is immune to which flavour produced the values, and
 * it is the shared path rule rather than a convention re-stated here.
 *
 * The host's own `normalize` is still used, so a Windows env resolves `C:\a\..\b` correctly;
 * only the separator used for the comparison is fixed.
 */
function containsPath(parent: string, child: string, path: CoreEnvPath): boolean {
  const canonical = (p: string) => toPosixPathKey(path.normalize(p));
  const normalizedParent = canonical(parent);
  const normalizedChild = canonical(child);
  if (normalizedChild === normalizedParent) return true;
  return normalizedChild.startsWith(`${normalizedParent}/`);
}

/**
 * Whether a command string redirects to a file (a write).
 *
 * `>>>` is not a redirection (it is not shell syntax); everything else containing `>` is
 * treated as one. Input redirection (`<`) is not a write.
 *
 * Only consulted when the *per-command* source is unavailable — see
 * {@link hasWriteRedirectionAcrossCommands} for why a whole-string scan is wrong.
 */
function hasWriteRedirection(source: string): boolean {
  return />/.test(source.replace(/<<<?/g, ""));
}

/**
 * Whether any command inside a compound string writes via redirection.
 *
 * Split from {@link hasWriteRedirection} because the tokenizer strips a redirection's
 * *operator* before the analyzer sees a command: it deliberately drops `> out.txt` (the AST
 * path skips those nodes too), so `cmd.source` no longer contains the `>`.
 *
 * The fallback therefore has to look for redirection somewhere else, and an earlier version
 * looked at the whole original string — which is wrong whenever the shells being classified
 * assign a different meaning to `>`:
 *
 * - PowerShell comparison operators: `if ($a -gt $b)`, and `->` in an argument
 * - cmd.exe: `>` is the redirection, but the surrounding syntax differs enough that a global
 *   scan cannot attribute it to a command
 *
 * Attributing the redirection to the specific segment it appears in keeps the result tied to a
 * real shell operator. A segment whose redirection cannot be parsed this way still ends up
 * `not read-only`, so the conservative outcome is preserved.
 *
 * Only `>` counts. `|` is a separator (the tokenizer splits on it), and treating other
 * operators as writes would misclassify read-only commands on the shells this fallback exists
 * for.
 */
function hasWriteRedirectionAcrossCommands(command: string): boolean {
  return command.split(/&&|\|\||[;|\n]|&/).some((segment) => hasWriteRedirection(segment));
}

/** Background marker (` & ` / trailing `&`), excluding `&&`. */
function isBackgroundCommand(command: string, source: string): boolean {
  if (/(^|[^&])&([^&]|$)/.test(command)) return true;
  return /&\s*$/.test(source);
}

// ============================================================================
// Analysis
// ============================================================================

/**
 * Build a safety report for a shell command.
 *
 * Two paths, selected by the shell the command will actually run under:
 *
 * - **Grammar available** (bash): parse an AST and classify each command from it, as before.
 * - **Grammar unavailable** (PowerShell, cmd.exe, unknown): tokenize and classify from the
 *   built-in tables. This exists because a parse failure used to return `commands: []`, which
 *   meant no command could ever be recognised as read-only and evaluators always fell through
 *   to "requires approval" — and subagents downgrade that to a denial. The visible effect was
 *   that a subagent could not run *any* command on Windows, with a message implying a user
 *   prompt would unblock it.
 *
 * FAIL-SAFE INVARIANT (the security-relevant part): the fallback may only ever grant read-only
 * status for a command whose normalized prefix is in {@link READONLY_PREFIXES} and which is
 * not a write op, carries no write redirection, and whose path arguments stay inside the
 * project root. It must never grant write or external-dir status, and anything it cannot
 * confidently classify stays as it was — unrecognised commands are simply not read-only, so
 * they keep the conservative outcome.
 */
export async function analyzeCommand(command: string, ctx: CommandAnalysisContext): Promise<CommandSafetyReport> {
  const shellKind = ctx.shellKind ?? (await resolveShellKind());

  // `unknown` means the host did not report a shell. Try the grammar anyway — plenty of hosts
  // are bash and simply do not advertise it — but only trust a *productive* parse. If the
  // bash grammar finds nothing, the command is more likely some other shell's syntax, so fall
  // through to the tables rather than reporting an empty (and therefore always-ask) report.
  if (shellKind === "bash" || shellKind === "unknown") {
    const tree = await parseCommandTree(command);
    if (tree) {
      const parsed = extractCommands(tree);
      // A command substitution is itself a command that runs, and the substitution body is
      // what carries the risk (`echo "$(rm -rf x)"`). The bash grammar does surface it, so
      // requiring the parse to have found it is a cheap consistency check: if it did not — a
      // grammar that is older or narrower than the syntax in use — the parse is not
      // trustworthy for this string, and the token table view is the conservative answer even
      // for a reported `bash`.
      const substitutionsCovered = !hasCommandSubstitution(command) || parsed.length > 1;
      if ((parsed.length > 0 || shellKind === "bash") && substitutionsCovered) {
        return analyzeParsedCommands(parsed, command, ctx);
      }
    } else if (shellKind === "bash") {
      // A grammar exists for this shell but the command did not parse. There is no token view
      // more trustworthy than the parser's own failure, so stay conservative.
      return { ok: false, commands: [], anyExternalDir: true, anyWriteOp: true };
    }
  }

  // No grammar for this shell (PowerShell, cmd.exe, or an unproductive unknown): classify from
  // the tables, and say so in the report.
  const tokens = tokenizeCommandString(command);
  const fallbackCommands: ParsedCommand[] = tokens.map((parts) => ({ tokens: parts, source: parts.join(" ") }));
  return {
    ...analyzeParsedCommands(fallbackCommands, command, ctx, {
      // The tokenizer strips redirections, so `cmd.source` no longer carries them. Detect them
      // on the original string instead — but per segment, so a `>` that belongs to a different
      // command (or to PowerShell syntax) is not attributed to a read-only one.
      globalWriteRedirection: hasWriteRedirectionAcrossCommands(command),
      globalBackground: isBackgroundCommand(command, command),
    }),
    ok: false,
    grammarUnavailable: true,
  };
}

/**
 * Classify a list of tokenized commands.
 *
 * Shared by the AST path and the fallback so both apply the identical read-only rule — a
 * second implementation is what would let the fallback drift permissive.
 *
 * `overrides` exists only for the fallback, whose input has had redirections tokenized away.
 */
function analyzeParsedCommands(
  parsed: ParsedCommand[],
  originalCommand: string,
  ctx: CommandAnalysisContext,
  overrides: { globalWriteRedirection?: boolean; globalBackground?: boolean } = {}
): CommandSafetyReport {
  const commands: CommandAnalysis[] = [];
  let anyExternalDir = false;
  let anyWriteOp = false;

  for (const cmd of parsed) {
    const name = canonicalizeCommandName(commandName(cmd.tokens));
    const prefix = commandPrefix(cmd.tokens);
    const normalized = prefix.join(" ");
    const isWriteCmd = WRITE_OPS.has(name);
    const writeRedirection = overrides.globalWriteRedirection ?? hasWriteRedirection(cmd.source);
    const background = overrides.globalBackground ?? isBackgroundCommand(originalCommand, cmd.source);
    const isReadOnly = !isWriteCmd && !writeRedirection && !background && READONLY_PREFIXES.has(normalized);

    const fileOps: FileOpAnalysis[] = [];
    if (FILE_COMMANDS.has(name)) {
      for (const rawArg of pathArgs(cmd.tokens)) {
        const expanded = expandArg(rawArg, ctx);
        const globbed = globPrefix(expanded);
        if (isDynamicArg(rawArg) || expanded.includes("$") || expanded === "" || globbed === undefined) {
          // Unresolvable path (variables/globs) — conservative: treat as external.
          fileOps.push({ op: name, arg: rawArg, resolvedPath: "", external: true, unresolvable: true });
          anyExternalDir = true;
          continue;
        }
        const resolved = ctx.path.isAbsolute(globbed)
          ? ctx.path.normalize(globbed)
          : ctx.path.resolve(ctx.cwd, globbed);
        const external = !containsPath(ctx.rootPath, resolved, ctx.path);
        fileOps.push({ op: name, arg: rawArg, resolvedPath: resolved, external });
        if (external) anyExternalDir = true;
      }
    }

    if (isWriteCmd || writeRedirection) anyWriteOp = true;
    commands.push({ tokens: cmd.tokens, source: cmd.source, prefix, normalized, isReadOnly, fileOps });
  }

  return { ok: true, commands, anyExternalDir, anyWriteOp };
}

/**
 * Build an analysis context from CoreEnv (runtime-agnostic).
 * `overrides` allow callers to pin cwd/home/env for testing or specific runs.
 */
export async function createAnalysisContext(
  overrides?: Partial<CommandAnalysisContext>
): Promise<CommandAnalysisContext> {
  const env = getEnv();
  const [home, envVars] = await Promise.all([env.homedir(), env.getEnv()]);
  return {
    rootPath: overrides?.rootPath ?? env.rootPath,
    cwd: overrides?.cwd ?? env.rootPath,
    home: overrides?.home ?? home,
    env: overrides?.env ?? envVars,
    path: overrides?.path ?? env.path ?? defaultPath,
  };
}
