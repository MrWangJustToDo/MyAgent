/**
 * ProviderManager — Manages search providers, auto-detection, and fallback.
 */

import { getEnv } from "../../../env.js";

import { ENV_WEBSEARCH_PROVIDER } from "./types.js";

import type { SearchOutcome, SearchProvider, SearchOptions, ProviderInfo } from "./types.js";

// ============================================================================
// ProviderManager
// ============================================================================

export class ProviderManager {
  private providers: SearchProvider[] = [];

  /**
   * Register a provider. Earlier registrations are preferred in auto mode
   * (first available wins).
   */
  register(provider: SearchProvider): void {
    // Avoid duplicate registrations of the same provider instance/name.
    if (this.providers.some((p) => p.name === provider.name)) return;
    this.providers.push(provider);
  }

  /**
   * Get the best available provider based on environment config.
   *
   * Selection logic:
   * 1. If `WEBSEARCH_PROVIDER` is a specific name and that provider is available, use it
   * 2. Otherwise auto-select: first available provider in registration order
   * 3. If none report available, use the last registered provider (DuckDuckGo)
   */
  async selectProvider(): Promise<SearchProvider> {
    const envVar = await this.getEnvVar(ENV_WEBSEARCH_PROVIDER);

    if (envVar && envVar !== "auto") {
      const explicit = this.providers.find((p) => p.name === envVar);
      if (explicit && (await this.isProviderAvailable(explicit))) {
        return explicit;
      }
    }

    for (const provider of this.providers) {
      if (await this.isProviderAvailable(provider)) {
        return provider;
      }
    }

    const last = this.providers[this.providers.length - 1];
    if (!last) {
      throw new Error("No search providers registered");
    }
    return last;
  }

  /**
   * Search with automatic fallback across providers.
   *
   * Tries the selected provider first. On failure, falls back to
   * other available providers. Throws only if all providers fail.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchOutcome> {
    const primary = await this.selectProvider();
    let lastError: Error | null = null;

    try {
      const results = await primary.search(query, options);
      return { results, provider: primary.name };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      for (const provider of this.providers) {
        if (provider === primary) continue;
        if (!(await this.isProviderAvailable(provider))) continue;
        try {
          const results = await provider.search(query, options);
          return { results, provider: provider.name };
        } catch (fallbackErr) {
          lastError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
        }
      }
    }

    throw new Error(`All search providers failed. Last error: ${lastError?.message ?? "unknown"}`);
  }

  /**
   * List all registered providers with their availability status.
   */
  async listProviders(): Promise<ProviderInfo[]> {
    const infos: ProviderInfo[] = [];
    for (const p of this.providers) {
      const available = await this.isProviderAvailable(p);
      infos.push({
        name: p.name,
        available,
        description: `${p.name} (${available ? "available" : "unavailable"})`,
      });
    }
    return infos;
  }

  private async isProviderAvailable(provider: SearchProvider): Promise<boolean> {
    return Boolean(await provider.isAvailable());
  }

  private async getEnvVar(key: string): Promise<string | undefined> {
    const env = await getEnv().getEnv();
    const value = env[key];
    return value === "" ? undefined : value;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: ProviderManager | null = null;

/**
 * Get or create the global ProviderManager singleton.
 */
export function getProviderManager(): ProviderManager {
  if (!instance) {
    instance = new ProviderManager();
  }
  return instance;
}

/**
 * Reset the singleton (for testing). Prefer {@link resetWebsearchProviders} from the barrel.
 */
export function resetProviderManager(): void {
  instance = null;
}
