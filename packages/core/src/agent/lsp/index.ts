/**
 * Built-in LSP extension — Language Server Protocol intelligence for the agent.
 *
 * The extension factory lives in `./extension.js`; this barrel is the public
 * import surface for the LSP domain.
 */

export { DEFAULT_DISABLED_LSP_TOOLS, createLspExtension, type LspExtensionConfig } from "./extension.js";
