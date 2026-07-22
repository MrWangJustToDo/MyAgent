import type { ManagedAgent, ModelInfo, ModelStyle } from "@my-agent/core";
import type { UIMessage } from "@tanstack/ai";

// ============================================================================
// App Configuration
// ============================================================================

export interface AppConfig {
  model: string;
  /** API style: OpenAI-compatible or Anthropic Messages */
  style: ModelStyle;
  /** API base URL (defaults per style when empty) */
  baseURL: string;
  apiKey: string;
  systemPrompt: string;
  initialPrompt: string;
  maxIterations: number;
  debug: boolean;
  mcpConfigPath: string;
  /**
   * Extra extension directories (comma-separated on CLI as `--extension-dirs`).
   * Merged ahead of `.agents/extension` and `~/.agents/extension`.
   */
  extensionDirs: string[];
  continueSession: boolean;
  resumeSession: string;
  /** Optional model metadata override from MODEL_* env vars */
  modelInfo?: ModelInfo;
}

// ============================================================================
// Command Result
// ============================================================================

export type CommandResult = { ok: true; message?: string } | { ok: false; error: string };

// ============================================================================
// Initialization Result
// ============================================================================

export interface InitResult {
  agent: ManagedAgent;
  initialMessages?: UIMessage[];
}

// ============================================================================
// Clipboard
// ============================================================================

export interface ClipboardImageResult {
  data: string;
  mediaType: string;
}

// ============================================================================
// Agent Adapter Interface
// ============================================================================

export interface AgentAdapter {
  initialize(config: AppConfig): Promise<InitResult>;
  destroy(): Promise<void>;
  exit(): void;
  readClipboardImage?(): Promise<ClipboardImageResult | null>;
}
