import { z } from "zod";

import type { ModelMessage } from "@tanstack/ai";

// ============================================================================
// Agent Config
// ============================================================================

export const AgentConfigSchema = z.object({
  model: z.string().min(1).describe("Model name to use"),
  modelStyle: z.enum(["openai", "anthropic"]).optional().describe("API style (OpenAI-compatible or Anthropic)"),
  modelBaseURL: z.string().optional().describe("Base URL for the model API"),
  modelApiKey: z.string().optional().describe("API key for the model endpoint"),
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

export type RunFinalizeReason = "finished" | "aborted" | "error";

// ============================================================================
// Run options
// ============================================================================

export interface AgentRunOptions {
  prompt?: string;
  messages?: ModelMessage[];
  abortSignal?: AbortSignal;
}
