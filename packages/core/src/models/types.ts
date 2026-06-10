// ============================================================================
// Model Configuration Types
// ============================================================================

/**
 * Internal model identifier used as registry key.
 * Format: provider-scoped (e.g. "claude-4-sonnet", "gpt-4.1", "deepseek-chat")
 * or prefixed for gateways (e.g. "openrouter/claude-4-sonnet").
 */
export type ModelId = string;

/**
 * Provider identifier — determines which API client to use.
 */
export type ModelProvider = "anthropic" | "openai" | "deepseek" | "google" | "ollama" | "open-router" | "xai";

/**
 * Model capability flags.
 * Using a string union for forward compatibility — new capabilities
 * can be added without breaking existing configs.
 */
export type ModelCapability =
  | "reasoning"
  | "vision"
  | "tool_calling"
  | "prompt_caching"
  | "streaming"
  | "json_output"
  | "computer_use";

/**
 * Reasoning-specific configuration for models that support thinking/CoT.
 */
export interface ReasoningConfig {
  /** Tag name used to extract reasoning (e.g. "think" for DeepSeek R1, Qwen3) */
  tagName?: string;
  /** Default reasoning effort level */
  defaultEffort?: "low" | "medium" | "high";
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
 * Complete model metadata entry in the registry.
 */
export interface ModelInfo {
  /** Internal identifier (registry key) */
  id: ModelId;
  /** Human-readable display name */
  name: string;
  /** Provider that serves this model */
  provider: ModelProvider;
  /** Actual model string sent to the API (may differ from id) */
  apiModel: string;
  /** Max input context window in tokens */
  contextWindow: number;
  /** Default max output tokens */
  defaultMaxTokens: number;
  /** Pricing in USD per 1M tokens */
  pricing?: ModelPricing;
  /** Capability flags */
  capabilities: ModelCapability[];
  /** Reasoning-specific config (only if "reasoning" capability is present) */
  reasoningConfig?: ReasoningConfig;
  /** Whether this is a recommended/default model for its provider */
  isDefault?: boolean;
}

/**
 * Lightweight model reference for UI display and selection.
 */
export interface ModelOption {
  id: ModelId;
  name: string;
  provider: ModelProvider;
  contextWindow: number;
  capabilities: ModelCapability[];
}
