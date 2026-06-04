/**
 * Environment module - unified abstraction for execution environments
 *
 * This module provides a consistent interface for different execution backends:
 * - local: Real bash with OS sandbox via @anthropic-ai/sandbox-runtime (default)
 * - native: Real bash without OS sandbox
 * - remote: Uses computesdk for remote execution on compute gateway
 *
 * @example
 * ```typescript
 * import {
 *   localEnvironment,
 *   nativeEnvironment,
 *   createLocalEnvironment,
 *   createRemoteEnvironment,
 * } from '@my-agent/core';
 *
 * // Default: OS-sandboxed real bash
 * const sandbox = await localEnvironment.createSandbox({
 *   rootPath: '/path/to/project',
 * });
 *
 * // Direct system access (no OS sandbox)
 * const native = await nativeEnvironment.createSandbox({
 *   rootPath: '/path/to/project',
 * });
 *
 * // Use remote environment with computesdk
 * const remoteEnv = createRemoteEnvironment({
 *   sandboxUrl: 'https://sandbox-123.sandbox.computesdk.com',
 *   sandboxId: 'sandbox-123',
 *   token: 'your-session-token',
 * });
 * const remoteSandbox = await remoteEnv.createSandbox({ rootPath: '/' });
 *
 * // All environments use the same API
 * const content = await sandbox.filesystem.readFile('/src/index.ts');
 * const result = await sandbox.runCommand('npm run build');
 *
 * // Cleanup
 * await sandbox.destroy();
 * ```
 */

// Export types
import { localEnvironment, nativeEnvironment } from "./local.js";
import { getConfiguredRemoteEnvironment } from "./remote-config.js";
import { remoteEnvironment } from "./remote.js";
import { type Environment, type EnvironmentType, isEnvironmentInstance } from "./types.js";

export { isEnvironmentInstance, FileError, ExecutionError } from "./types.js";

export type {
  Environment,
  EnvironmentType,
  Sandbox,
  SandboxConfig,
  SandboxFileSystem,
  FileEntry,
  FileStat,
  CommandResult,
  RunCommandOptions,
} from "./types.js";

// Export shell utilities
export {
  getShellConfig,
  spawnCommand,
  killProcessTree,
  waitForChildProcess,
  trackDetachedChildPid,
  untrackDetachedChildPid,
} from "./shell.js";

// Export local environment
export {
  localEnvironment,
  nativeEnvironment,
  createLocalEnvironment,
  type LocalEnvironmentConfig,
  type LocalEnvironmentMode,
} from "./local.js";

// Export remote environment (uses computesdk)
export {
  remoteEnvironment,
  createRemoteEnvironment,
  DEFAULT_REMOTE_WORKSPACE_PATH,
  type RemoteEnvironmentConfig,
} from "./remote.js";
export { getConfiguredRemoteEnvironment, getRemoteEnvironmentConfigFromEnv } from "./remote-config.js";

/**
 * Default environment (local)
 */
export const defaultEnvironment: Environment = localEnvironment;

/**
 * Get an environment by type or return the provided environment
 *
 * @param env - Environment type ('local', 'native', 'remote') or Environment instance
 * @returns The resolved Environment instance
 *
 * @example
 * ```typescript
 * // Get by type
 * const localEnv = getEnvironment('local');              // OS-sandboxed real bash
 * const nativeEnv = getEnvironment('native');            // no OS sandbox
 * const remoteEnv = getEnvironment('remote');   // cloud execution
 *
 * // Pass through custom environment
 * const customEnv = createRemoteEnvironment({ apiUrl: '...' });
 * const env = getEnvironment(customEnv); // Returns customEnv
 * ```
 */
export function getEnvironment(env: EnvironmentType): Environment {
  if (isEnvironmentInstance(env)) {
    return env;
  }

  switch (env) {
    case "local":
      return localEnvironment;
    case "native":
      return nativeEnvironment;
    case "remote": {
      const configured = getConfiguredRemoteEnvironment();
      if (configured) {
        return configured;
      }
      return remoteEnvironment;
    }
    default: {
      const _exhaustive: never = env;
      throw new Error(`Unknown environment type: ${_exhaustive}`);
    }
  }
}
