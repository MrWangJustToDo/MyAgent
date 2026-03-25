import {
  defaultEnvironment,
  getEnvironment,
  type Environment,
  type EnvironmentType,
  type Sandbox,
} from "../environment";

// ============================================================================
// SandboxManager Class
// ============================================================================

/**
 * SandboxManager manages sandbox instances for different root paths.
 *
 * Responsibilities:
 * - Create and cache sandbox instances by root path
 * - Manage environment configuration
 * - Handle sandbox lifecycle (create, destroy, reset)
 *
 * @example
 * ```typescript
 * const manager = new SandboxManager();
 *
 * // Set environment (optional, defaults to local)
 * manager.setEnvironment("remote");
 *
 * // Get or create sandbox with environment variables
 * const sandbox = await manager.getSandbox("/path/to/project", {
 *   env: { NODE_ENV: "development", API_KEY: "secret" }
 * });
 *
 * // Use sandbox
 * const content = await sandbox.filesystem.readFile("src/index.ts");
 * const result = await sandbox.runCommand("npm test");
 *
 * // Cleanup
 * await manager.deleteSandbox("/path/to/project");
 * // or
 * await manager.reset();
 * ```
 */
export class SandboxManager {
  /** Current environment for creating sandboxes */
  private environment: Environment;

  /** Cache of sandbox instances by root path */
  private sandboxes: Map<string, Sandbox> = new Map();

  /** Cache of sandbox IDs by root path (for retrieval) */
  private sandboxIds: Map<string, string> = new Map();

  /**
   * Create a SandboxManager with an optional environment.
   * @param env - Environment type ('local', 'remote') or Environment instance. Defaults to 'local' (just-bash sandbox).
   */
  constructor(env?: EnvironmentType) {
    this.environment = env ? getEnvironment(env) : defaultEnvironment;
  }

  // ============================================================================
  // Environment Management
  // ============================================================================

  /**
   * Set the environment for all future sandbox operations
   */
  setEnvironment(env: EnvironmentType): void {
    this.environment = getEnvironment(env);
  }

  /**
   * Get the current environment
   */
  getEnvironment(): Environment {
    return this.environment;
  }

  // ============================================================================
  // Sandbox Management
  // ============================================================================

  /**
   * Get or create a sandbox for the given root path
   */
  async getSandbox(rootPath: string): Promise<Sandbox> {
    // Check if we already have a sandbox for this path
    const existingSandbox = this.sandboxes.get(rootPath);
    if (existingSandbox) {
      return existingSandbox;
    }

    // Check if we have a sandboxId and try to retrieve it
    const sandboxId = this.sandboxIds.get(rootPath);
    if (sandboxId && this.environment.getSandboxById) {
      const sandbox = await this.environment.getSandboxById(sandboxId);
      if (sandbox) {
        this.sandboxes.set(rootPath, sandbox);
        return sandbox;
      }
    }

    // Create a new sandbox
    const newSandbox = await this.environment.createSandbox({
      rootPath,
      cwd: "/",
    });

    this.sandboxes.set(rootPath, newSandbox);
    this.sandboxIds.set(rootPath, newSandbox.sandboxId);

    return newSandbox;
  }

  /**
   * Check if a sandbox exists for the given root path
   */
  hasSandbox(rootPath: string): boolean {
    return this.sandboxes.has(rootPath);
  }

  /**
   * Delete a sandbox for the given root path
   */
  async deleteSandbox(rootPath: string): Promise<void> {
    const sandbox = this.sandboxes.get(rootPath);
    if (sandbox) {
      await sandbox.destroy();
    }

    this.sandboxes.delete(rootPath);
    this.sandboxIds.delete(rootPath);
  }

  /**
   * Reset all sandboxes
   */
  async reset(): Promise<void> {
    const rootPaths = Array.from(this.sandboxes.keys());
    await Promise.all(rootPaths.map((rootPath) => this.deleteSandbox(rootPath)));
  }

  /**
   * Get all managed root paths
   */
  getRootPaths(): string[] {
    return Array.from(this.sandboxes.keys());
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default singleton instance for global use
 */
export const sandboxManager = new SandboxManager();

/**
 * Configure the sandbox environment for the global sandboxManager.
 *
 * Call this before creating any agents to set the execution environment.
 *
 * @param env - Environment type: 'local' (just-bash sandbox), 'native' (direct system), 'remote' (cloud), or a custom Environment instance
 *
 * @example
 * ```typescript
 * import { configureSandboxEnv } from '@my-agent/core';
 *
 * // Set from .env file
 * const sandboxEnv = process.env.SANDBOX_ENV || 'local';
 * configureSandboxEnv(sandboxEnv as 'local' | 'native' | 'remote');
 *
 * // Then create agents as normal
 * const agent = await agentManager.createManagedAgent({ ... });
 * ```
 */
export function configureSandboxEnv(env: EnvironmentType): void {
  sandboxManager.setEnvironment(env);
}
