import { createState } from "reactivity-store";

import type { ModelStyle } from "@my-agent/core";

const STORAGE_KEY = "my-agent-playground-config";

export interface PlaygroundConfig {
  model: string;
  style: ModelStyle;
  baseURL: string;
  apiKey: string;
}

const defaults: PlaygroundConfig = {
  model: "gpt-4o-mini",
  style: "openai",
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
};

function load(): PlaygroundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
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
      });
    },
  }),
});
