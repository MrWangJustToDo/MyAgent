// ============================================================================
// Model Configuration Types
// ============================================================================

/**
 * API protocol style — determines which TanStack text adapter to use.
 */
export type ModelStyle = "openai" | "anthropic";

/**
 * Internal model identifier used as registry key.
 * Format: vendor-scoped (e.g. "claude-4-sonnet", "gpt-4.1", "deepseek-chat")
 * or prefixed for gateways (e.g. "openrouter/claude-4-sonnet").
 */
export type ModelId = string;

/**
 * Every model capability, as a runtime value.
 *
 * The single source of truth for the capability list. `ModelCapability` is derived from it,
 * so the union and this array cannot drift apart — add a capability here and the union
 * follows.
 *
 * Order is the declaration order used for display/iteration; do not reorder casually, as
 * snapshots and generated tables follow it.
 *
 * **runtime-true** marks the capabilities every Chat Completions / Messages endpoint we
 * support provides as a transport property rather than an optional model feature. They are
 * granted unconditionally instead of being read from provider metadata, and they are what
 * keeps `capabilities` from being empty for a plain text model — an empty array means
 * "unknown" to {@link CapabilityProbe.hasCapability}, which is permissive, so it must not
 * be produced by a successful metadata parse. See `parseModelsDevModel`.
 */
export const MODEL_CAPABILITIES = [
  "streaming",
  "reasoning",
  "vision",
  "audio",
  "video",
  "document",
  "tool_calling",
  "prompt_caching",
  "json_output",
  "computer_use",
] as const;

/**
 * Capabilities granted from the transport rather than from provider metadata.
 *
 * `streaming` is the only member: every endpoint we ship adapters for streams, and models.dev
 * has no field for it. It is also the reason a plain text model still yields a non-empty
 * capability list, which is load-bearing — see {@link MODEL_CAPABILITIES}.
 */
export const RUNTIME_TRUE_CAPABILITIES: readonly ModelCapability[] = ["streaming"];

/**
 * Model capability flags.
 * Using a string union for forward compatibility — new capabilities
 * can be added without breaking existing configs.
 *
 * Derived from {@link MODEL_CAPABILITIES} so there is exactly one list.
 */
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

/** Reasoning effort values a model may accept. */
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max" | "minimal";

/**
 * Reasoning-specific configuration for models that support thinking/CoT.
 */
export interface ReasoningConfig {
  /** Tag name used to extract reasoning (e.g. "think" for DeepSeek R1, Qwen3) */
  tagName?: string;
  /** Default reasoning effort level */
  defaultEffort?: ReasoningEffort;
  /**
   * All effort values the model accepts, from models.dev `reasoning_options`
   * (e.g. `["none","low","medium","high"]`). Used by the UI to offer only
   * valid choices. Empty/undefined means the model does not advertise effort
   * levels — effort configuration is unavailable.
   */
  effortValues?: ReasoningEffort[];
  /** Max thinking budget in tokens (if supported) */
  maxBudget?: number;
}

/**
 * Pricing in USD per 1M tokens.
 * All fields optional — local/free models have no pricing.
 */
export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheWritePerM?: number;
  cacheReadPerM?: number;
}

/**
 * Complete model metadata entry.
 */
export interface ModelInfo {
  /** Internal identifier (registry key) */
  id: ModelId;
  /** Human-readable display name */
  name: string;
  /** API style this model uses (openai-compatible vs anthropic) */
  style: ModelStyle;
  /** Actual model string sent to the API (may differ from id) */
  apiModel: string;
  /** Max input context window in tokens. May be undefined if not yet resolved from models.dev. */
  contextWindow?: number;
  /** Default max output tokens. May be undefined if not yet resolved from models.dev. */
  defaultMaxTokens?: number;
  /** Pricing in USD per 1M tokens */
  pricing?: ModelPricing;
  /** Capability flags */
  capabilities: ModelCapability[];
  /**
   * Reasoning-specific config (only if "reasoning" capability is present).
   * Metadata only today — not yet applied to TanStack adapter request options.
   * Wire protocol quirks (e.g. DeepSeek `reasoning_content` echo) live in
   * `createTextAdapter` / `ReasoningChatCompletionsTextAdapter`, not in middleware.
   */
  reasoningConfig?: ReasoningConfig;
  /** Whether this is a recommended/default model for its style */
  isDefault?: boolean;
  /** Optional API base URL override (merged into connection resolution) */
  baseURL?: string;
}

/**
 * Lightweight model reference for UI display and selection.
 */
export interface ModelOption {
  id: ModelId;
  name: string;
  style: ModelStyle;
  contextWindow?: number;
  capabilities: ModelCapability[];
}
