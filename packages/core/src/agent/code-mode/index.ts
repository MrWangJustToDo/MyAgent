// Code Mode module exports

// Built-in code-mode extension (sandboxed TypeScript execution)
export { createCodeModeExtension, type CodeModeExtensionConfig } from "./extension.js";

// Binding-name normalisation (legal-identifier guarantee for sandbox bindings)
export { normalizeBindingName, renameCodeModeTools } from "./binding-names.js";
export type { BindingNameLog, BindingNameRenameResult } from "./binding-names.js";
