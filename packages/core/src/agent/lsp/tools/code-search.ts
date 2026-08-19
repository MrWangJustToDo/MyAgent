/**
 * ast_search — Find code matching a structural pattern with metavariables.
 *
 * Uses tree-sitter AST matching to find code by structure, not text.
 * Supports `$NAME` for single-node wildcards and `$$$NAME` for variadic.
 */

import { compilePattern } from "../tree-sitter/pattern-compiler.js";
import { searchFiles } from "../tree-sitter/search-engine.js";

import type { TreeSitterManager, TreeSitterEnv } from "../tree-sitter/parser-manager.js";

function truncateHead(
  text: string,
  maxLines = 200
): { content: string; truncated: boolean; totalLines: number; outputLines: number } {
  const lines = text.split("\n");
  const totalLines = lines.length;
  const out = lines.slice(0, maxLines).join("\n");
  return { content: out, truncated: totalLines > maxLines, totalLines, outputLines: Math.min(totalLines, maxLines) };
}

export interface CodeSearchToolDeps {
  rootDir: string | (() => string);
  treeSitter: TreeSitterManager;
  env: TreeSitterEnv;
}

export function createCodeSearchTool(deps: CodeSearchToolDeps) {
  const getRootDir: () => string = () => (typeof deps.rootDir === "function" ? deps.rootDir() : deps.rootDir);

  return {
    name: "ast_search",
    description:
      "Find code matching a structural pattern using AST matching. Use $NAME to match any single node, $$$NAME to match zero-or-more nodes. More precise than grep — matches code structure, not text.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Structural pattern with metavariables ($NAME for single node, $$$NAME for variadic).",
        },
        language: { type: "string", description: "Target language (typescript, python, rust, java, etc.)." },
        path: { type: "string", description: "File or directory to search (default: workspace root)." },
        max_results: { type: "number", description: "Maximum results to return (default: 50)." },
      },
      required: ["pattern", "language"],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const params = input as { pattern?: string; language?: string; path?: string; max_results?: number };
      const rootDir = getRootDir();

      let compiled: Awaited<ReturnType<typeof compilePattern>> | undefined;
      try {
        compiled = await compilePattern(params.pattern ?? "", params.language ?? "", deps.treeSitter);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: `Error: ${msg}`, matchCount: 0, filesSearched: 0 };
      }

      if (!deps.treeSitter.available()) {
        return {
          text: "Tree-sitter is not available in this environment (no grammar locator).",
          matchCount: 0,
          filesSearched: 0,
        };
      }
      if (!compiled) {
        return { text: "Failed to compile pattern.", matchCount: 0, filesSearched: 0 };
      }

      const matches = await searchFiles(compiled, rootDir, deps.treeSitter, deps.env, {
        path: params.path,
        maxResults: params.max_results ?? 50,
      });

      if (matches.length === 0) {
        return { text: "No matches found.", matchCount: 0, filesSearched: 0 };
      }

      const lines: string[] = [];
      lines.push(`Found ${matches.length} match${matches.length !== 1 ? "es" : ""}:\n`);

      for (const m of matches) {
        const relPath = m.file.startsWith(rootDir)
          ? m.file.slice(rootDir.length).replace(/^[/\\]/, "") || m.file
          : m.file;
        const matchText = m.matchedText.length > 200 ? m.matchedText.slice(0, 200) + "..." : m.matchedText;

        lines.push(`${relPath}:${m.line}:${m.column}`);
        lines.push(`  ${matchText.replace(/\n/g, "\n  ")}`);

        const captureEntries = Object.entries(m.captures);
        if (captureEntries.length > 0) {
          for (const [name, value] of captureEntries) {
            const displayValue = value.length > 100 ? value.slice(0, 100) + "..." : value;
            lines.push(`  $${name} = ${displayValue}`);
          }
        }
        lines.push("");
      }

      const text = lines.join("\n");
      const uniqueFiles = new Set(matches.map((m) => m.file));
      const trunc = truncateHead(text);
      let output = trunc.content;
      if (trunc.truncated) {
        output += `\n\n[Truncated: showing ${trunc.outputLines} of ${trunc.totalLines} lines]`;
      }

      return { text: output, matchCount: matches.length, filesSearched: uniqueFiles.size };
    },
  };
}
