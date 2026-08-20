import type { ModelToolContent, ToModelOutputContext } from "../../tools/runtime/to-model-output-registry.js";

/** Extension/LSP tools that return `{ text: string, ... }` for the model. */
export function lspTextToModelOutput(ctx: ToModelOutputContext): ModelToolContent {
  const output = ctx.output as { text?: string } | undefined;
  if (typeof output?.text === "string") return output.text;
  return JSON.stringify(output ?? {});
}

export const LSP_TEXT_TOOL_NAMES = [
  "lsp_diagnostics",
  "lsp_hover",
  "lsp_definition",
  "lsp_references",
  "lsp_symbols",
  "lsp_rename",
  "lsp_completions",
  "lsp_code_actions",
  "code_overview",
  "ast_search",
  "code_rewrite",
] as const;
