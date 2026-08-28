/**
 * Command parser — parse shell command strings into an AST via tree-sitter bash.
 *
 * Uses the existing {@link TreeSitterManager} (web-tree-sitter WASM) with the
 * `bash` grammar, mirroring how opencode parses shell commands
 * (`tmp/sst-opencode/.../tool/shell.ts`). The manager is a module-level lazy
 * singleton built exclusively from CoreEnv (via `getEnv()`), so it stays
 * runtime-agnostic: no direct `process`/`os`/global access.
 *
 * Only bash is supported for now. PowerShell/cmd parsing (opencode supports
 * tree-sitter-powershell) is intentionally not ported — bash is the primary
 * host shell.
 */

import { getEnv, defaultPath } from "../../../env.js";
import { TreeSitterManager } from "../../lsp/tree-sitter/parser-manager.js";

import type { TreeSitterEnv } from "../../lsp/tree-sitter/parser-manager.js";
import type { Node, Tree } from "web-tree-sitter";

// ============================================================================
// Parsed command shape
// ============================================================================

export interface ParsedCommand {
  /** Raw argument tokens (command name first), redirections/separators removed. */
  tokens: string[];
  /** The command's source text (falls back to the enclosing redirected_statement). */
  source: string;
}

// ============================================================================
// Tree-sitter manager singleton
// ============================================================================

let managerPromise: Promise<TreeSitterManager> | null = null;

function createTreeSitterEnv(): TreeSitterEnv {
  const env = getEnv();
  const path = env.path ?? defaultPath;
  return {
    readFile: (p) => env.fs.readFile(p),
    writeFile: (p, content) => env.fs.writeFile(p, content),
    readdir: async (p) => {
      const entries = await env.fs.readdir(p);
      return entries.map((e) => ({ name: e.name, isDirectory: e.type === "directory", isFile: e.type === "file" }));
    },
    stat: (p) => env.fs.stat(p),
    resolve: (...parts) => path.resolve(...parts),
    locateGrammar: (grammarFile) =>
      env.locateTreeSitterGrammar ? env.locateTreeSitterGrammar(grammarFile) : Promise.resolve(null),
  };
}

/**
 * Lazily create + initialize the shared command TreeSitterManager.
 *
 * The manager is created once and cached. Command parsing only uses
 * {@link TreeSitterManager.parseWithLanguage} with the explicit `bash`
 * language, so the file-path → language resolver is a no-op.
 */
async function getCommandTreeSitterManager(): Promise<TreeSitterManager | null> {
  if (!managerPromise) {
    managerPromise = (async () => {
      const manager = new TreeSitterManager(createTreeSitterEnv(), () => undefined);
      await manager.init();
      return manager;
    })();
  }
  return managerPromise;
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse a shell command string into a tree-sitter AST, or null when
 * tree-sitter is unavailable or parsing fails. Callers treat null conservatively.
 */
export async function parseCommandTree(command: string): Promise<Tree | null> {
  if (!command || !command.trim()) return null;
  try {
    const manager = await getCommandTreeSitterManager();
    if (!manager || !manager.available()) return null;
    return await manager.parseWithLanguage("command:bash", command, "bash");
  } catch {
    return null;
  }
}

// ============================================================================
// AST → command list
// ============================================================================

interface Part {
  type: string;
  text: string;
}

/** Collect meaningful argument tokens from a `command` node (opencode `parts`). */
function commandParts(node: Node): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "command_elements") {
      for (let j = 0; j < child.childCount; j++) {
        const item = child.child(j);
        if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue;
        out.push({ type: item.type, text: item.text });
      }
      continue;
    }
    if (
      child.type !== "command_name" &&
      child.type !== "command_name_expr" &&
      child.type !== "word" &&
      child.type !== "string" &&
      child.type !== "raw_string" &&
      child.type !== "concatenation"
    ) {
      continue;
    }
    out.push({ type: child.type, text: child.text });
  }
  return out;
}

/** Source text of a command node, including a wrapping redirected_statement. */
function commandSource(node: Node): string {
  const parent = node.parent;
  return (parent && parent.type === "redirected_statement" ? parent.text : node.text).trim();
}

/**
 * Extract the list of commands from a parsed tree, handling `;`, `&&`, `||`,
 * pipelines, and nested command nodes (subshells, loops). Mirrors opencode's
 * `commands()`/`parts()` traversal.
 */
export function extractCommands(tree: Tree): ParsedCommand[] {
  const out: ParsedCommand[] = [];
  for (const raw of tree.rootNode.descendantsOfType("command")) {
    if (!raw) continue;
    const parts = commandParts(raw);
    if (parts.length === 0) continue;
    out.push({ tokens: parts.map((p) => p.text), source: commandSource(raw) });
  }
  return out;
}
