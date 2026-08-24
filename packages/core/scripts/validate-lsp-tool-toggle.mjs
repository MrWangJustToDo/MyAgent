/**
 * Validation for the LSP extension per-tool enable toggle.
 *
 * Covers:
 * - DEFAULT_DISABLED_LSP_TOOLS contains the low-usage tool names
 * - createLspExtension is exported and produces an extension API
 *
 * The tool-registration gating itself lives in `activateLsp` (registerTool is
 * only called when the tool is not in the disabled set); that path is covered
 * by typecheck/build and the full LSP validate suite.
 *
 * Run: pnpm --filter @my-agent/core run validate:lsp-tool-toggle
 */

import assert from "node:assert/strict";

import { DEFAULT_DISABLED_LSP_TOOLS, createLspExtension } from "../dist/dev.mjs";

// Default disabled set = the low-usage tools we skip to save per-turn context.
assert.ok(Array.isArray(DEFAULT_DISABLED_LSP_TOOLS), "DEFAULT_DISABLED_LSP_TOOLS is an array");
for (const name of DEFAULT_DISABLED_LSP_TOOLS) {
  assert.equal(typeof name, "string", "disabled tool names are strings");
}

// Must include the zero-usage tools identified from session telemetry.
// ast_search/code_rewrite/code_overview are structural tree-sitter tools that
// overlap with universal tools (grep/glob/tree) and lsp_symbols.
for (const tool of ["lsp_rename", "lsp_code_actions", "ast_search", "code_rewrite", "code_overview"]) {
  assert.ok(DEFAULT_DISABLED_LSP_TOOLS.includes(tool), `default disabled set includes ${tool}`);
}

// High-value tools must NOT be in the default disabled set.
for (const tool of ["lsp_diagnostics", "lsp_hover", "lsp_definition", "lsp_references", "lsp_symbols"]) {
  assert.ok(!DEFAULT_DISABLED_LSP_TOOLS.includes(tool), `default disabled set excludes ${tool}`);
}

// createLspExtension produces an ExtensionAPI (accepts optional config).
const apiNoConfig = createLspExtension();
assert.equal(apiNoConfig.id, "my-agent-lsp", "extension id is my-agent-lsp");
assert.equal(typeof apiNoConfig.activate, "function", "extension has activate");

const apiWithConfig = createLspExtension({ enableAll: true });
assert.equal(apiWithConfig.id, "my-agent-lsp", "createLspExtension accepts config");

const apiWithDisabledTools = createLspExtension({ disabledTools: ["lsp_rename"] });
assert.equal(apiWithDisabledTools.id, "my-agent-lsp", "createLspExtension accepts disabledTools config");

console.log("lsp-tool-toggle validation passed");
