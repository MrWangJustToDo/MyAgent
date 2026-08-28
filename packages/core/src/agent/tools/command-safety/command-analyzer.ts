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

import { commandName, commandPrefix } from "./command-arity.js";
import { extractCommands, parseCommandTree } from "./command-parser.js";

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
  /** False when tree-sitter parsing failed or was unavailable. */
  ok: boolean;
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
const READ_FILE_COMMANDS = new Set(["cat", "head", "tail", "grep", "find", "sed", "wc", "sort", "ls"]);
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

/** True when `child` is inside or equal to `parent` (opencode `containsPath`). */
function containsPath(parent: string, child: string, path: CoreEnvPath): boolean {
  const normalizedParent = path.normalize(parent).replace(/[\\/]+$/, "");
  const normalizedChild = path.normalize(child);
  if (normalizedChild === normalizedParent) return true;
  const sep = path.getSep();
  return normalizedChild.startsWith(normalizedParent + sep);
}

/** True when the command source writes via redirection (excludes heredocs). */
function hasWriteRedirection(source: string): boolean {
  return />/.test(source.replace(/<<<?/g, ""));
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
 * The report is the input to {@link evaluateCommandApproval}. A parse failure
 * yields `ok: false` with `anyWriteOp: true` so callers treat it conservatively.
 */
export async function analyzeCommand(command: string, ctx: CommandAnalysisContext): Promise<CommandSafetyReport> {
  const tree = await parseCommandTree(command);
  if (!tree) {
    return { ok: false, commands: [], anyExternalDir: true, anyWriteOp: true };
  }

  const parsed = extractCommands(tree);
  const commands: CommandAnalysis[] = [];
  let anyExternalDir = false;
  let anyWriteOp = false;

  for (const cmd of parsed) {
    const name = commandName(cmd.tokens);
    const prefix = commandPrefix(cmd.tokens);
    const normalized = prefix.join(" ");
    const isWriteCmd = WRITE_OPS.has(name);
    const writeRedirection = hasWriteRedirection(cmd.source);
    const background = isBackgroundCommand(command, cmd.source);
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
