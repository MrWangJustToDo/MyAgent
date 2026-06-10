import type { ModelId, ModelInfo } from "../types.js";

export const googleModels: Record<ModelId, ModelInfo> = {
  // ── Gemini 3.x family (current) ────────────────────────────────────────────
  "gemini-3.5-flash": {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "google",
    apiModel: "gemini-3.5-flash",
    contextWindow: 1_048_576,
    defaultMaxTokens: 65_536,
    pricing: {
      inputPerM: 1.5,
      outputPerM: 9.0,
    },
    capabilities: ["reasoning", "vision", "tool_calling", "streaming", "json_output"],
    reasoningConfig: { defaultEffort: "medium" },
    isDefault: true,
  },
  "gemini-3.1-pro-preview": {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "google",
    apiModel: "gemini-3.1-pro-preview",
    contextWindow: 1_048_576,
    defaultMaxTokens: 65_536,
    pricing: {
      inputPerM: 2.0,
      outputPerM: 12.0,
    },
    capabilities: ["reasoning", "vision", "tool_calling", "streaming", "json_output"],
    reasoningConfig: { defaultEffort: "medium" },
    isDefault: false,
  },
  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash-Lite",
    provider: "google",
    apiModel: "gemini-3.1-flash-lite",
    contextWindow: 1_048_576,
    defaultMaxTokens: 65_536,
    pricing: {
      inputPerM: 0.25,
      outputPerM: 1.5,
    },
    capabilities: ["reasoning", "vision", "tool_calling", "streaming", "json_output"],
    reasoningConfig: { defaultEffort: "low" },
    isDefault: false,
  },

  // ── Gemini 2.5 family (retiring Oct 2026) ──────────────────────────────────
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    apiModel: "gemini-2.5-pro",
    contextWindow: 1_048_576,
    defaultMaxTokens: 65_536,
    pricing: {
      inputPerM: 1.25,
      outputPerM: 10.0,
    },
    capabilities: ["reasoning", "vision", "tool_calling", "streaming", "json_output"],
    reasoningConfig: { defaultEffort: "medium" },
    isDefault: false,
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    apiModel: "gemini-2.5-flash",
    contextWindow: 1_048_576,
    defaultMaxTokens: 65_536,
    pricing: {
      inputPerM: 0.3,
      outputPerM: 2.5,
    },
    capabilities: ["reasoning", "vision", "tool_calling", "streaming", "json_output"],
    reasoningConfig: { defaultEffort: "low" },
    isDefault: false,
  },
  "gemini-2.5-flash-lite": {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    provider: "google",
    apiModel: "gemini-2.5-flash-lite",
    contextWindow: 1_048_576,
    defaultMaxTokens: 65_536,
    pricing: {
      inputPerM: 0.1,
      outputPerM: 0.4,
    },
    capabilities: ["reasoning", "vision", "tool_calling", "streaming", "json_output"],
    isDefault: false,
  },
};
