import type { Agent, ModelInfo } from "@my-agent/core";
import type { ChatTransport, UIMessage } from "ai";

// ============================================================================
// App Configuration
// ============================================================================

export type Provider = "ollama" | "openRouter" | "openaiCompatible" | "deepseek";

export interface AppConfig {
  model: string;
  url: string;
  systemPrompt: string;
  initialPrompt: string;
  maxIterations: number;
  debug: boolean;
  provider: Provider;
  apiKey: string;
  mcpConfigPath: string;
  continueSession: boolean;
  resumeSession: string;
  /**
   * Optional model metadata override (context window, pricing, capabilities, etc).
   * When provided, this takes priority over the registry lookup and is applied to
   * the agent even if the model id is not registered.
   *
   * Typically derived from MODEL_* environment variables by the host (CLI, etc).
   */
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
  agent: Agent | null;
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
  /** Create agent with model, tools, and session config */
  initialize(config: AppConfig): Promise<InitResult>;

  /** Create the AI SDK chat transport for the initialized agent */
  createTransport(): ChatTransport<UIMessage>;

  /** Cleanup agent and resources */
  destroy(): Promise<void>;

  /** Exit the application (platform-specific) */
  exit(): void;

  /** Read image from system clipboard (platform-specific, optional) */
  readClipboardImage?(): Promise<ClipboardImageResult | null>;
}
