/**
 * Remote environment implementation using computesdk
 *
 * This environment runs commands and file operations on a remote
 * compute gateway using the computesdk client.
 */

import { Sandbox as ComputeSandbox } from "computesdk";

import type { Environment, Sandbox, SandboxConfig } from "./types";

/**
 * Remote environment configuration
 */
export interface RemoteEnvironmentConfig {
  /** Sandbox URL (e.g., https://sandbox-123.sandbox.computesdk.com) */
  sandboxUrl: string;
  /** Sandbox ID */
  sandboxId: string;
  /** Access token or session token for authentication */
  token?: string;
  /** Provider name (default: 'gateway') */
  provider?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** WebSocket implementation (optional, uses global WebSocket if not provided) */
  WebSocket?: new (url: string) => WebSocket;
}

/**
 * Wrap a computesdk Sandbox to match our unified Sandbox interface
 */
function wrapComputeSandbox(remoteSandbox: ComputeSandbox, config: RemoteEnvironmentConfig): Sandbox {
  const sandbox: Sandbox = {
    sandboxId: remoteSandbox.sandboxId,
    provider: config.provider ?? "remote",

    filesystem: {
      readFile: async (path: string) => {
        return remoteSandbox.readFile(path);
      },
      writeFile: async (path: string, content: string) => {
        await remoteSandbox.writeFile(path, content);
      },
      readdir: async (path: string) => {
        const response = await remoteSandbox.listFiles(path);
        return response.data.files.map((file) => ({
          name: file.name,
          type: file.is_dir ? ("directory" as const) : ("file" as const),
          size: file.size,
          modified: file.modified_at ? new Date(file.modified_at) : undefined,
        }));
      },
      mkdir: async (path: string) => {
        // Create directory by creating a placeholder file and deleting it,
        // or use the file API to create a directory
        // computesdk doesn't have explicit mkdir, so we create an empty file in the dir
        await remoteSandbox.createFile(path + "/.gitkeep", "");
        await remoteSandbox.deleteFile(path + "/.gitkeep");
      },
      exists: async (path: string) => {
        return remoteSandbox.checkFileExists(path);
      },
      remove: async (path: string) => {
        await remoteSandbox.deleteFile(path);
      },
    },

    runCommand: async (command: string, options) => {
      const result = await remoteSandbox.runCommand(command, {
        cwd: options?.cwd,
        env: options?.env,
        background: options?.background,
        timeout: options?.timeout ? Math.ceil(options.timeout / 1000) : undefined,
      });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      };
    },

    destroy: async () => {
      await remoteSandbox.destroy();
    },
  };

  return sandbox;
}

// Store remote sandbox instances
const remoteSandboxes = new Map<string, { sandbox: Sandbox; config: RemoteEnvironmentConfig }>();

/**
 * Create a remote environment instance
 *
 * @example
 * ```typescript
 * const remoteEnv = createRemoteEnvironment({
 *   sandboxUrl: 'https://sandbox-123.sandbox.computesdk.com',
 *   sandboxId: 'sandbox-123',
 *   token: 'your-session-token',
 * });
 *
 * const sandbox = await remoteEnv.createSandbox({ rootPath: '/workspace' });
 * ```
 */
export function createRemoteEnvironment(config: RemoteEnvironmentConfig): Environment {
  return {
    name: "remote",

    async createSandbox(sandboxConfig: SandboxConfig): Promise<Sandbox> {
      // Create the computesdk sandbox client
      const remoteSandbox = new ComputeSandbox({
        sandboxUrl: config.sandboxUrl,
        sandboxId: config.sandboxId,
        token: config.token,
        provider: config.provider ?? "gateway",
        headers: config.headers,
        WebSocket: config.WebSocket,
      });

      // Wrap it with our unified interface
      const sandbox = wrapComputeSandbox(remoteSandbox, config);

      // Store for later retrieval
      remoteSandboxes.set(sandbox.sandboxId, { sandbox, config });

      return sandbox;
    },

    async getSandboxById(sandboxId: string): Promise<Sandbox | undefined> {
      const cached = remoteSandboxes.get(sandboxId);
      if (cached) {
        return cached.sandbox;
      }

      // For remote sandboxes, we can reconnect if we have the config
      // But we need the original config, so return undefined if not cached
      return undefined;
    },
  };
}

/**
 * Default remote environment (requires configuration before use)
 *
 * @example
 * ```typescript
 * // Use createRemoteEnvironment() instead for proper configuration
 * const env = createRemoteEnvironment({
 *   sandboxUrl: 'https://sandbox-123.sandbox.computesdk.com',
 *   sandboxId: 'sandbox-123',
 *   token: 'your-token',
 * });
 * ```
 */
export const remoteEnvironment: Environment = {
  name: "remote",

  async createSandbox(_config: SandboxConfig): Promise<Sandbox> {
    throw new Error(
      "Remote environment requires configuration. Use createRemoteEnvironment(config) to create a configured instance."
    );
  },

  async getSandboxById(_sandboxId: string): Promise<Sandbox | undefined> {
    throw new Error(
      "Remote environment requires configuration. Use createRemoteEnvironment(config) to create a configured instance."
    );
  },
};
