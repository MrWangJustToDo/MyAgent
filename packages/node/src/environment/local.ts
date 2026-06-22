/**
 * Local environment configuration types.
 *
 * These types are used by createNodeEnv() to determine
 * whether to use OS sandbox for shell commands.
 */

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

export function resolveLocalEnvironmentMode(config: LocalEnvironmentConfig): LocalEnvironmentMode {
  if (config.mode) {
    return config.mode;
  }
  if (config.sandbox === false) {
    return "native";
  }
  return "os";
}
