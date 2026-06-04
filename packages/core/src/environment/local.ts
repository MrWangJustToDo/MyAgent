/**
 * Local environment implementation
 *
 * Modes:
 * - os (default): Real bash + Node fs, shell wrapped with @anthropic-ai/sandbox-runtime
 * - native: Real bash + Node fs, no OS sandbox
 */

import { createNativeFilesystem } from "./native-fs.js";
import { runNativeCommand } from "./native-run.js";
import { resetOsSandbox } from "./os-sandbox.js";

import type { Environment, Sandbox, SandboxConfig } from "./types.js";

// ============================================================================
// Native / OS-sandboxed modes (real bash + Node.js fs)
// ============================================================================

let localSandboxCounter = 0;

async function createLocalNativeSandbox(
  config: SandboxConfig,
  provider: "local-os" | "local-native",
  useOsSandbox: boolean
): Promise<Sandbox> {
  const { rootPath, filesystem, resolvePath } = createNativeFilesystem(config.rootPath);
  const sandboxId = `${provider}-${++localSandboxCounter}-${Date.now()}`;

  return {
    sandboxId,
    provider,
    workspacePath: rootPath,
    filesystem,
    runCommand: (command, options) => runNativeCommand(rootPath, resolvePath, command, options, useOsSandbox),
    destroy: async () => {
      if (useOsSandbox) {
        await resetOsSandbox();
      }
    },
  };
}

async function createOsSandboxedSandbox(config: SandboxConfig): Promise<Sandbox> {
  return createLocalNativeSandbox(config, "local-os", true);
}

async function createNativeSandbox(config: SandboxConfig): Promise<Sandbox> {
  return createLocalNativeSandbox(config, "local-native", false);
}

// ============================================================================
// Environment Factory
// ============================================================================

/** Local environment execution mode */
export type LocalEnvironmentMode = "os" | "native";

/**
 * Local environment configuration
 */
export interface LocalEnvironmentConfig {
  /**
   * - os (default): Real bash with OS sandbox (@anthropic-ai/sandbox-runtime)
   * - native: Real bash without OS sandbox
   */
  mode?: LocalEnvironmentMode;
  /**
   * @deprecated Use `mode: "os"` or `mode: "native"`.
   * - true → os (sandboxed)
   * - false → native
   */
  sandbox?: boolean;
}

function resolveLocalEnvironmentMode(config: LocalEnvironmentConfig): LocalEnvironmentMode {
  if (config.mode) {
    return config.mode;
  }
  if (config.sandbox === false) {
    return "native";
  }
  return "os";
}

/**
 * Create a local environment with the specified configuration
 */
export function createLocalEnvironment(config: LocalEnvironmentConfig = {}): Environment {
  const mode = resolveLocalEnvironmentMode(config);
  const environmentName = mode === "os" ? "local" : "local-native";

  return {
    name: environmentName,

    async createSandbox(sandboxConfig: SandboxConfig): Promise<Sandbox> {
      if (mode === "os") {
        return createOsSandboxedSandbox(sandboxConfig);
      }
      return createNativeSandbox(sandboxConfig);
    },

    async getSandboxById(_sandboxId: string): Promise<Sandbox | undefined> {
      return undefined;
    },
  };
}

/** Default local environment: real bash with OS sandbox */
export const localEnvironment: Environment = createLocalEnvironment({ mode: "os" });

/** Native local environment: real bash, no OS sandbox */
export const nativeEnvironment: Environment = createLocalEnvironment({ mode: "native" });
