/**
 * lsp_definition — go to the definition of a symbol.
 */

import { formatLocation, formatLocationLink } from "../shared/format.js";

import { resolvePosition, withResolved } from "./shared.js";

import type { LspManager } from "../lsp-manager.js";
import type { Location, LocationLink } from "vscode-languageserver-protocol";

type DefinitionResult = Location | Location[] | LocationLink[] | null;

export interface DefinitionToolDeps {
  manager: LspManager;
  fallback?: (filePath: string, line: number, character: number) => Promise<string | null>;
}

export function createDefinitionTool(deps: DefinitionToolDeps) {
  return {
    name: "lsp_definition",
    description:
      "Go to the definition of a symbol at a position (1-indexed line/character, or a query symbol name). Returns the file path and location of the definition.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        line: { type: "number", description: "Line number (1-indexed). Required unless query is provided." },
        character: { type: "number", description: "Column number (1-indexed). Required unless query is provided." },
        query: { type: "string", description: "Symbol name to find in the file (alternative to line/character)." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const params = input as { path?: string; line?: number; character?: number; query?: string };
      const filePath = (params.path ?? "").replace(/^@/, "");

      const pos = await resolvePosition(deps.manager, filePath, params);
      if (pos.error) return { text: pos.error, count: 0 };
      const { line, character, resolvedFrom } = pos;

      const client = await deps.manager.getClientForFile(filePath).catch(() => null);

      if (client) {
        const uri = deps.manager.getFileUri(filePath);
        const position = { line: line - 1, character: character - 1 };
        try {
          const result = await client.connection.sendRequest<DefinitionResult>("textDocument/definition", {
            textDocument: { uri },
            position,
          });

          if (!result || (Array.isArray(result) && result.length === 0)) {
            return { text: withResolved(resolvedFrom, "No definition found."), count: 0 };
          }

          const rootDir = deps.manager.resolvePath(".");
          let locations: string[];

          if (Array.isArray(result)) {
            if ("targetUri" in result[0]) {
              locations = (result as LocationLink[]).map((l) => formatLocationLink(l, rootDir));
            } else {
              locations = (result as Location[]).map((l) => formatLocation(l, rootDir));
            }
          } else {
            locations = [formatLocation(result as Location, rootDir)];
          }

          const text =
            locations.length === 1
              ? `Definition: ${locations[0]}`
              : `Definitions:\n${locations.map((l) => `  ${l}`).join("\n")}`;
          return { text: withResolved(resolvedFrom, text), count: locations.length };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { text: `LSP definition request failed: ${msg}`, count: 0 };
        }
      }

      if (deps.fallback) {
        const fallbackText = await deps.fallback(filePath, line, character);
        if (fallbackText != null) {
          return { text: withResolved(resolvedFrom, fallbackText), count: 0, source: "fallback" };
        }
      }

      return { text: deps.manager.getUnavailableReason(filePath), count: 0 };
    },
  };
}
