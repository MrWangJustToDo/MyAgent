import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { hookConfigSchema, HOOKS_CONFIG_FILE, HOOKS_DIR } from "./types.js";

import type { HookConfig, HookEntry, HookEventType, HookMatcher } from "./types.js";

// ============================================================================
// HookRegistry
// ============================================================================

export class HookRegistry {
  private config: HookConfig = {};
  private rootPath: string;
  private loaded = false;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async load(): Promise<void> {
    const configPath = join(this.rootPath, HOOKS_DIR, HOOKS_CONFIG_FILE);
    try {
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      this.config = hookConfigSchema.parse(parsed);
      this.loaded = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.config = {};
        this.loaded = true;
        return;
      }
      throw new Error(`Failed to load hooks config from ${configPath}: ${err}`);
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  hasHooks(): boolean {
    return !!this.config.hooks && Object.keys(this.config.hooks).length > 0;
  }

  /**
   * Get matching hook entries for an event + optional matcher value (e.g. tool name).
   * Returns a flat list of HookEntry to execute.
   */
  getMatchingHooks(event: HookEventType, matchValue?: string): HookEntry[] {
    const matchers = this.config.hooks?.[event];
    if (!matchers || matchers.length === 0) return [];

    const result: HookEntry[] = [];
    for (const m of matchers) {
      if (matchesMatcher(m, matchValue)) {
        result.push(...m.hooks);
      }
    }
    return result;
  }

  getRootPath(): string {
    return this.rootPath;
  }
}

/**
 * Check if a matcher matches the given value.
 * Empty/undefined matcher matches everything.
 * Pipe-separated patterns: "write_file|edit_file" matches either.
 */
function matchesMatcher(matcher: HookMatcher, value?: string): boolean {
  const pattern = matcher.matcher ?? "";
  if (pattern === "") return true;
  if (!value) return false;
  const patterns = pattern.split("|").map((p) => p.trim());
  return patterns.some((p) => p === value || globMatch(p, value));
}

/**
 * Simple glob matching: supports * as wildcard.
 */
function globMatch(pattern: string, value: string): boolean {
  if (!pattern.includes("*")) return pattern === value;
  const regex = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "*" ? ".*" : "\\" + c)) + "$");
  return regex.test(value);
}
