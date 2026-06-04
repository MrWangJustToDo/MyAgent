/**
 * Build a configured remote environment from process environment variables.
 */

import { createRemoteEnvironment, DEFAULT_REMOTE_WORKSPACE_PATH, type RemoteEnvironmentConfig } from "./remote.js";

import type { Environment } from "./types.js";

export { DEFAULT_REMOTE_WORKSPACE_PATH };

/**
 * Read remote sandbox connection settings from the environment.
 *
 * Required: `SANDBOX_URL`, `SANDBOX_ID`
 * Optional: `SANDBOX_TOKEN`, `REMOTE_WORKSPACE_PATH` (default: `/`)
 */
export function getRemoteEnvironmentConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): RemoteEnvironmentConfig | undefined {
  const sandboxUrl = env.SANDBOX_URL?.trim();
  const sandboxId = env.SANDBOX_ID?.trim();
  if (!sandboxUrl || !sandboxId) {
    return undefined;
  }

  return {
    sandboxUrl,
    sandboxId,
    token: env.SANDBOX_TOKEN?.trim() || undefined,
    provider: env.SANDBOX_PROVIDER?.trim() || undefined,
    workspacePath: env.REMOTE_WORKSPACE_PATH?.trim() || DEFAULT_REMOTE_WORKSPACE_PATH,
  };
}

/**
 * Create a remote environment when `SANDBOX_URL` and `SANDBOX_ID` are set.
 */
export function getConfiguredRemoteEnvironment(env: NodeJS.ProcessEnv = process.env): Environment | undefined {
  const config = getRemoteEnvironmentConfigFromEnv(env);
  if (!config) {
    return undefined;
  }
  return createRemoteEnvironment(config);
}
