/**
 * Remote environment implementation using computesdk
 *
 * This environment runs commands and file operations on a remote
 * compute gateway using the computesdk client.
 */

import { Sandbox as ComputeSandbox } from "computesdk";

import { createRemotePathResolver } from "./remote-path.js";

import type { Environment, Sandbox, SandboxConfig, SandboxFileSystem } from "./types.js";

/** Default workspace directory inside the remote VM */
export const DEFAULT_REMOTE_WORKSPACE_PATH = "/";

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
  /**
   * Workspace root inside the remote sandbox (default: `/`).
   * Agent paths and default command cwd are resolved relative to this directory.
   */
  workspacePath?: string;
}

interface WrapRemoteSandboxOptions {
  remoteSandbox: ComputeSandbox;
  config: RemoteEnvironmentConfig;
  sandboxConfig: SandboxConfig;
}

/**
 * Wrap a computesdk Sandbox to match our unified Sandbox interface.
 * All paths are resolved against the remote workspace, not the local cwd.
 */
function wrapComputeSandbox(options: WrapRemoteSandboxOptions): Sandbox {
  const { remoteSandbox, config, sandboxConfig } = options;
  const workspacePath = config.workspacePath ?? sandboxConfig.workspacePath ?? DEFAULT_REMOTE_WORKSPACE_PATH;
  const resolvePath = createRemotePathResolver(workspacePath, sandboxConfig.rootPath);

  const filesystem: SandboxFileSystem = {
    readFile: async (filePath: string) => {
      return remoteSandbox.readFile(resolvePath(filePath));
    },
    writeFile: async (filePath: string, content: string) => {
      await remoteSandbox.writeFile(resolvePath(filePath), content);
    },
    readdir: async (dirPath: string) => {
      const response = await remoteSandbox.listFiles(resolvePath(dirPath));
      return response.data.files.map((file) => ({
        name: file.name,
        type: file.is_dir ? ("directory" as const) : ("file" as const),
        size: file.size,
        modified: file.modified_at ? new Date(file.modified_at) : undefined,
      }));
    },
    mkdir: async (dirPath: string) => {
      const fullPath = resolvePath(dirPath);
      await remoteSandbox.createFile(fullPath + "/.gitkeep", "");
      await remoteSandbox.deleteFile(fullPath + "/.gitkeep");
    },
    exists: async (filePath: string) => {
      return remoteSandbox.checkFileExists(resolvePath(filePath));
    },
    remove: async (filePath: string) => {
      await remoteSandbox.deleteFile(resolvePath(filePath));
    },
  };

  const sandbox: Sandbox = {
    sandboxId: remoteSandbox.sandboxId,
    provider: config.provider ?? "remote",
    workspacePath,

    filesystem,

    runCommand: async (command: string, runOptions) => {
      const cwd = runOptions?.cwd ? resolvePath(runOptions.cwd) : workspacePath;
      const result = await remoteSandbox.runCommand(command, {
        cwd,
        env: runOptions?.env,
        background: runOptions?.background,
        timeout: runOptions?.timeout ? Math.ceil(runOptions.timeout / 1000) : undefined,
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
 *   workspacePath: '/workspace',
 * });
 *
 * // rootPath = local cwd (cache key); workspace lives on the remote VM
 * const sandbox = await remoteEnv.createSandbox({
 *   rootPath: process.cwd(),
 *   workspacePath: '/workspace',
 * });
 * ```
 */
export function createRemoteEnvironment(config: RemoteEnvironmentConfig): Environment {
  return {
    name: "remote",

    async createSandbox(sandboxConfig: SandboxConfig): Promise<Sandbox> {
      const remoteSandbox = new ComputeSandbox({
        sandboxUrl: config.sandboxUrl,
        sandboxId: config.sandboxId,
        token: config.token,
        provider: config.provider ?? "gateway",
        headers: config.headers,
        WebSocket: config.WebSocket,
      });

      const sandbox = wrapComputeSandbox({
        remoteSandbox,
        config,
        sandboxConfig,
      });

      remoteSandboxes.set(sandbox.sandboxId, { sandbox, config });

      return sandbox;
    },

    async getSandboxById(sandboxId: string): Promise<Sandbox | undefined> {
      const cached = remoteSandboxes.get(sandboxId);
      if (cached) {
        return cached.sandbox;
      }

      return undefined;
    },
  };
}

/**
 * Default remote environment (requires configuration before use)
 */
export const remoteEnvironment: Environment = {
  name: "remote",

  async createSandbox(_config: SandboxConfig): Promise<Sandbox> {
    throw new Error(
      "Remote environment requires configuration. Set SANDBOX_URL and SANDBOX_ID, or use createRemoteEnvironment(config)."
    );
  },

  async getSandboxById(_sandboxId: string): Promise<Sandbox | undefined> {
    throw new Error(
      "Remote environment requires configuration. Set SANDBOX_URL and SANDBOX_ID, or use createRemoteEnvironment(config)."
    );
  },
};
