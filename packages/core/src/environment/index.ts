/**
 * Environment module - unified abstraction for execution environments
 *
 * This module provides a consistent interface for different execution backends:
 * - local (sandbox): Uses just-bash for isolated local execution (default)
 * - local (native): Uses real bash and Node.js fs for direct system access
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
 * // Use the default local environment (just-bash sandbox mode)
 * const sandbox = await localEnvironment.createSandbox({
 *   rootPath: '/path/to/project',
 * });
 *
 * // Use native mode (direct system access, no sandbox)
 * const native = await nativeEnvironment.createSandbox({
 *   rootPath: '/path/to/project',
 * });
 *
 * // Or create with explicit configuration
 * const sandboxEnv = createLocalEnvironment({ sandbox: true });  // just-bash
 * const nativeEnv = createLocalEnvironment({ sandbox: false });  // real bash
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
// Import for getEnvironment
import { localEnvironment, nativeEnvironment } from "./local";
import { remoteEnvironment } from "./remote";
import { isEnvironmentInstance, type Environment, type EnvironmentType } from "./types";

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
} from "./types";

export { isEnvironmentInstance } from "./types";

// Export local environment
export { localEnvironment, nativeEnvironment, createLocalEnvironment, type LocalEnvironmentConfig } from "./local";

// Export remote environment (uses computesdk)
export { remoteEnvironment, createRemoteEnvironment, type RemoteEnvironmentConfig } from "./remote";

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
 * const localEnv = getEnvironment('local');     // just-bash sandbox (isolated)
 * const nativeEnv = getEnvironment('native');   // direct system access
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
    case "remote":
      return remoteEnvironment;
    default: {
      const _exhaustive: never = env;
      throw new Error(`Unknown environment type: ${_exhaustive}`);
    }
  }
}
