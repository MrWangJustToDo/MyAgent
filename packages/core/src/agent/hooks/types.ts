import { z } from "zod";

// ============================================================================
// Hook Event Types
// ============================================================================

export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  /** Declared for hook configs; not emitted by the agent runtime yet. */
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "Notification",
  "SubagentStart",
  "SubagentStop",
] as const;

export type HookEventType = (typeof HOOK_EVENTS)[number];

// ============================================================================
// Hook Configuration Schemas
// ============================================================================

export const hookEntrySchema = z.object({
  type: z.enum(["command", "code"]),
  command: z.string().optional(),
  path: z.string().optional(),
  timeout: z.number().int().positive().optional(),
});

export const hookMatcherSchema = z.object({
  matcher: z.string().optional().default(""),
  hooks: z.array(hookEntrySchema).min(1),
});

export const hookConfigSchema = z.object({
  hooks: z.record(z.enum(HOOK_EVENTS as unknown as [string, ...string[]]), z.array(hookMatcherSchema)).optional(),
});

export type HookEntry = z.infer<typeof hookEntrySchema>;
export type HookMatcher = z.infer<typeof hookMatcherSchema>;
export type HookConfig = z.infer<typeof hookConfigSchema>;

// ============================================================================
// Hook Event Input Types
// ============================================================================

export interface SessionStartInput {
  hook_event_name: "SessionStart";
  session_id: string;
  cwd: string;
}

export interface UserPromptSubmitInput {
  hook_event_name: "UserPromptSubmit";
  session_id: string;
  prompt: string;
}

export interface PreToolUseInput {
  hook_event_name: "PreToolUse";
  session_id: string;
  tool_name: string;
  tool_input: unknown;
}

export interface PostToolUseInput {
  hook_event_name: "PostToolUse";
  session_id: string;
  tool_name: string;
  tool_input: unknown;
  tool_output: unknown;
  duration_ms: number;
}

export interface PostToolUseFailureInput {
  hook_event_name: "PostToolUseFailure";
  session_id: string;
  tool_name: string;
  tool_input: unknown;
  error: string;
}

export interface StopInput {
  hook_event_name: "Stop";
  session_id: string;
  reason: string;
}

export interface NotificationInput {
  hook_event_name: "Notification";
  session_id: string;
  message: string;
}

export interface SubagentStartInput {
  hook_event_name: "SubagentStart";
  session_id: string;
  subagent_id: string;
  description: string;
}

export interface SubagentStopInput {
  hook_event_name: "SubagentStop";
  session_id: string;
  subagent_id: string;
  summary: string;
}

export type HookEventInput =
  | SessionStartInput
  | UserPromptSubmitInput
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | StopInput
  | NotificationInput
  | SubagentStartInput
  | SubagentStopInput;

// ============================================================================
// Hook Result (for PreToolUse blocking)
// ============================================================================

export interface HookResult {
  decision?: "allow" | "deny";
  reason?: string;
  modifiedInput?: unknown;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_HOOK_TIMEOUT_MS = 30_000;
export const HOOKS_DIR = ".agent-hooks";
export const HOOKS_CONFIG_FILE = "hooks.json";
