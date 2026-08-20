/**
 * Shared helpers for position-based LSP tools.
 */

import { resolveSymbolPosition, getSymbolNames } from "../shared/resolve-position.js";

import type { LspManager } from "../lsp-manager.js";

export interface ResolvedPositionResult {
  line: number;
  character: number;
  resolvedFrom?: string;
  error?: string;
}

/**
 * Resolve a (line, character) pair, allowing a `query` symbol name instead.
 * Returns either a valid position or an error message.
 */
export async function resolvePosition(
  manager: LspManager,
  filePath: string,
  params: { line?: number; character?: number; query?: string }
): Promise<ResolvedPositionResult> {
  let { line, character } = params;

  if ((line === undefined || character === undefined) && params.query) {
    const resolved = await resolveSymbolPosition(filePath, params.query, manager);
    if (resolved) {
      line = resolved.line;
      character = resolved.character;
      return {
        line,
        character,
        resolvedFrom: `Resolved "${params.query}" → ${resolved.symbolName} at ${line}:${character} [${resolved.source}]`,
      };
    }
    const names = await getSymbolNames(filePath, manager);
    const hint = names.length > 0 ? `\nAvailable symbols: ${names.slice(0, 20).join(", ")}` : "";
    return { line: 0, character: 0, error: `Could not find symbol "${params.query}" in ${filePath}${hint}` };
  }

  if (line === undefined || character === undefined) {
    return { line: 0, character: 0, error: "Either line/character or query is required." };
  }

  return { line, character };
}

/** Join an optional resolved-from prefix onto a message. */
export function withResolved(resolvedFrom: string | undefined, text: string): string {
  return resolvedFrom ? `${resolvedFrom}\n\n${text}` : text;
}
