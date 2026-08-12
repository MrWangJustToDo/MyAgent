/**
 * ProviderManager — Manages search providers, auto-detection, and fallback.
 */

import type { WebsearchToolConfig } from "../tool-config.js";
import type { SearchOutcome, SearchProvider, SearchOptions, ProviderInfo } from "./types.js";

// ============================================================================
// ProviderManager
// ============================================================================

export class ProviderManager {
  private providers: SearchProvider[] = [];
  private preferredProvider?: string;
  private braveApiKey?: string;

  /**
   * Apply host-supplied websearch config (secrets + preferred provider).
   * Call before select/search so availability matches the active agent.
   */
  configure(config?: WebsearchToolConfig): void {
    this.braveApiKey = config?.braveApiKey?.trim() || undefined;
    const preferred = config?.provider?.trim();
    this.preferredProvider = preferred && preferred !== "" ? preferred : undefined;
  }

  /** Brave API key from the last {@link configure} call (not CoreEnv). */
  getBraveApiKey(): string | undefined {
    return this.braveApiKey;
  }

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
   * Get the best available provider based on configured preference.
   *
   * Selection logic:
   * 1. If preferred provider is a specific name and that provider is available, use it
   * 2. Otherwise auto-select: first available provider in registration order
   * 3. If none report available, use the last registered provider (DuckDuckGo)
   */
  async selectProvider(): Promise<SearchProvider> {
    const preferred = this.preferredProvider;

    if (preferred && preferred !== "auto") {
      const explicit = this.providers.find((p) => p.name === preferred);
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
