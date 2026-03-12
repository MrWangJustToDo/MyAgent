/**
 * Managers module - class-based state management
 *
 * This module provides manager classes for handling sandbox and tools lifecycle.
 * These are pure TypeScript classes without any reactivity dependencies.
 *
 * @example
 * ```typescript
 * import { sandboxManager, toolsManager, SandboxManager, ToolsManager } from '@my-agent/core';
 *
 * // Use singleton instances
 * const sandbox = await sandboxManager.getSandbox("/path/to/project");
 * const tools = await toolsManager.getTools("/path/to/project");
 *
 * // Or create your own instances
 * const mySandboxManager = new SandboxManager();
 * const myToolsManager = new ToolsManager(mySandboxManager);
 * ```
 */

export { SandboxManager, sandboxManager } from "./SandboxManager.js";
export { ToolsManager, toolsManager } from "./ToolsManager.js";
