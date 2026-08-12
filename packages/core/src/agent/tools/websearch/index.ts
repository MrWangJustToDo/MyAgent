/**
 * WebSearch Module — Barrel export for the multi-provider search architecture.
 *
 * Registers providers with the global ProviderManager singleton.
 * Call {@link initializeProviders} before first use.
 */

import { getProviderManager, resetProviderManager } from "./provider.js";
import { braveProvider } from "./providers/brave.js";
import { duckduckgoProvider } from "./providers/duckduckgo.js";

import type { WebsearchToolConfig } from "../tool-config.js";
import type { SearchProvider, SearchResult, SearchOptions, SearchOutcome, ProviderInfo } from "./types.js";

export type { SearchProvider, SearchResult, SearchOptions, SearchOutcome, ProviderInfo };

export { ProviderManager, getProviderManager, resetProviderManager } from "./provider.js";
export { filterResultsByDomain } from "./domain-filter.js";
export { createTimeoutAbort } from "./abort-timeout.js";
export { duckduckgoProvider } from "./providers/duckduckgo.js";
export { braveProvider } from "./providers/brave.js";

// ============================================================================
// Initialization
// ============================================================================

let initialized = false;

/**
 * Initialize the provider manager with all available providers.
 *
 * Registration order determines preference (first available wins):
 * 1. Brave (API-based, when braveApiKey is configured)
 * 2. DuckDuckGo (free, always available fallback)
 *
 * Pass {@link WebsearchToolConfig} so secrets come from the host, not CoreEnv.
 */
export function initializeProviders(config?: WebsearchToolConfig): void {
  if (!initialized) {
    initialized = true;
    const pm = getProviderManager();
    pm.register(braveProvider);
    pm.register(duckduckgoProvider);
  }
  getProviderManager().configure(config);
}

/**
 * Reset providers + initialization flag (for testing).
 */
export function resetWebsearchProviders(): void {
  initialized = false;
  resetProviderManager();
}
