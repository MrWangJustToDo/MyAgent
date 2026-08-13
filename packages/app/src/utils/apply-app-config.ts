import type { AppConfig } from "../adapter/types.js";

/**
 * Copy optional host fields onto the app config store.
 * `initConfig` must call this so CLI-parsed `toolConfig` / `agentRemote` survive
 * into `adapter.initialize` → `Host.create`.
 */
export function applyOptionalAppConfig(target: AppConfig, source: Partial<AppConfig>): void {
  target.modelInfo = source.modelInfo;
  target.providerMode = source.providerMode;
  target.toolConfig = source.toolConfig;
  target.agentRemote = source.agentRemote;
}

/** Drop optional host fields (used by `useConfig.reset`). */
export function clearOptionalAppConfig(target: AppConfig): void {
  target.modelInfo = undefined;
  target.providerMode = undefined;
  target.toolConfig = undefined;
  target.agentRemote = undefined;
}
