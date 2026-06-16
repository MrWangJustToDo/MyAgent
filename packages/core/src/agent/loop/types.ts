import { z } from "zod";

import type { LanguageModel, ModelMessage, TextStreamPart, ToolSet as VercelToolSet } from "ai";

// ============================================================================
// Agent Config
// ============================================================================

export const AgentConfigSchema = z.object({
  model: z.string().min(1).describe("Model name to use"),
  baseURL: z.string().optional().describe("Base URL for the model API"),
  systemPrompt: z.string().optional().describe("System prompt for the agent"),
  maxIterations: z.number().int().min(1).max(100).optional().default(10).describe("Maximum agentic loop iterations"),
  maxTokens: z.number().int().min(1).optional().describe("Maximum tokens per response"),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================================================
// Agent Status
// ============================================================================

export type AgentStatus =
  | "idle"
  | "running"
  | "completed"
  | "error"
  | "aborted"
  | "waiting"
  | "compacting"
  | "thinking"
  | "responding";

// ============================================================================
// Shared Types
// ============================================================================

/** Tool set type - Record of Vercel AI tools */
export type ToolSet = VercelToolSet;

/** Stream part type from Vercel AI SDK */
export type StreamPart = TextStreamPart<ToolSet>;

/** Vercel AI SDK usage type (used by context.updateUsage) */
export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
}

/** Run options */
export interface AgentRunOptions {
  /** User prompt (creates a user message) */
  prompt?: string;
  /** Messages array */
  messages?: ModelMessage[];
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Override model for this run */
  model?: LanguageModel;
}
