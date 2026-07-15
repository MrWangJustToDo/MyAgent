import type { UIMessage } from "@tanstack/ai";

export type CachedFlatMessage = {
  signature: string;
  flat: UIMessage[];
};

/** Non-reactive flatten cache (must not write createState during render). */
const cache = new Map<string, CachedFlatMessage>();

export function getFlatMessage(key: string): CachedFlatMessage | undefined {
  return cache.get(key);
}

export function setFlatMessage(key: string, value: CachedFlatMessage): void {
  cache.set(key, value);
}

export function clearFlatMessageCache(): void {
  cache.clear();
}
