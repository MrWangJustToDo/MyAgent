import { createTools, type Tools } from "../agent/tools";

import { sandboxManager } from "./SandboxManager";

import type { SandboxManager } from "./SandboxManager";

// ============================================================================
// ToolsManager Class
// ============================================================================

/**
 * ToolsManager manages tool instances for different root paths.
 *
 * Responsibilities:
 * - Create and cache tool instances by root path
 * - Coordinate with SandboxManager for sandbox access
 * - Handle tool lifecycle (create, delete, clear)
 *
 * @example
 * ```typescript
 * const manager = new ToolsManager();
 *
 * // Get or create tools for a path
 * const tools = await manager.getTools("/path/to/project");
 *
 * // Use tools with AI SDK
 * const result = await generateText({
 *   model,
 *   tools: tools as unknown as ToolSet,
 *   prompt: "Read the README file",
 * });
 *
 * // Cleanup
 * manager.deleteTools("/path/to/project");
 * // or
 * manager.clear();
 * ```
 */
export class ToolsManager {
  /** Cache of tools instances by root path */
  private toolsMap: Map<string, Tools> = new Map();

  /** Reference to sandbox manager */
  private sandboxManager: SandboxManager;

  constructor(sandboxMgr: SandboxManager = sandboxManager) {
    this.sandboxManager = sandboxMgr;
  }

  // ============================================================================
  // Tools Management
  // ============================================================================

  /**
   * Get or create tools for the given root path
   */
  async getTools(rootPath: string): Promise<Tools> {
    // Check if we already have tools for this path
    const existingTools = this.toolsMap.get(rootPath);
    if (existingTools) {
      return existingTools;
    }

    // Get sandbox (creates if needed)
    const sandbox = await this.sandboxManager.getSandbox(rootPath);

    // Create tools
    const tools = await createTools({ sandbox });

    this.toolsMap.set(rootPath, tools);

    return tools;
  }

  /**
   * Check if tools exist for the given root path
   */
  hasTools(rootPath: string): boolean {
    return this.toolsMap.has(rootPath);
  }

  /**
   * Delete tools for the given root path
   */
  deleteTools(rootPath: string): void {
    this.toolsMap.delete(rootPath);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.toolsMap.clear();
  }

  /**
   * Get all managed root paths
   */
  getRootPaths(): string[] {
    return Array.from(this.toolsMap.keys());
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default singleton instance for global use
 */
export const toolsManager = new ToolsManager();
