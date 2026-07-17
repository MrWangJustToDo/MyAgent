import { createState } from "reactivity-store";

import type { ModelStyle } from "@my-agent/core";

const STORAGE_KEY = "my-agent-playground-config";

export interface PlaygroundConfig {
  model: string;
  style: ModelStyle;
  baseURL: string;
  apiKey: string;
  /** Cloudflare Worker (or other) CORS proxy for webfetch/websearch. Empty = Vite `/__fetch_proxy` in dev. */
  fetchProxyUrl: string;
  /** Enable @my-react/react DevTool panel for debugging the component tree. */
  devtoolEnabled: boolean;
}

const bakedFetchProxyUrl = (import.meta.env.VITE_FETCH_PROXY_URL as string | undefined)?.trim() ?? "";

const defaults: PlaygroundConfig = {
  model: "gpt-4o-mini",
  style: "openai",
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  // Baked at build time when VITE_FETCH_PROXY_URL is set (e.g. GitHub Actions / .env).
  fetchProxyUrl: bakedFetchProxyUrl,
  devtoolEnabled: true,
};

function load(): PlaygroundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const stored = JSON.parse(raw) as Partial<PlaygroundConfig>;
    // Empty string must not wipe a bake-time VITE_FETCH_PROXY_URL default.
    if (!stored.fetchProxyUrl?.trim() && defaults.fetchProxyUrl) {
      const { fetchProxyUrl: _ignored, ...rest } = stored;
      return { ...defaults, ...rest, fetchProxyUrl: defaults.fetchProxyUrl };
    }
    return { ...defaults, ...stored };
  } catch {
    return { ...defaults };
  }
}

function persist(config: PlaygroundConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore quota / private mode
  }
}

const initial = typeof localStorage !== "undefined" ? load() : { ...defaults };

export const usePlaygroundConfig = createState(() => ({ ...initial }), {
  withActions: (state) => ({
    setConfig: (patch: Partial<PlaygroundConfig>) => {
      Object.assign(state, patch);
      persist({
        model: state.model,
        style: state.style,
        baseURL: state.baseURL,
        apiKey: state.apiKey,
        fetchProxyUrl: state.fetchProxyUrl,
        devtoolEnabled: state.devtoolEnabled,
      });
    },
  }),
});
