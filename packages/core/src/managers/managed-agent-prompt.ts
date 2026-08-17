import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "../models/prompt-cache.js";

import type { AgentConfig } from "./agent-types.js";
import type { SkillRegistry } from "../agent/skills";

export { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "../models/prompt-cache.js";

export interface SystemPromptInput {
  config: AgentConfig;
  agentDocContent: string;
  skillRegister: SkillRegistry | null;
  memoryContent: string;
}

export function buildFrozenSystemPrompt(input: SystemPromptInput): string | undefined {
  const parts: string[] = [];

  if (input.config.systemPrompt) {
    parts.push(input.config.systemPrompt);
  }

  if (input.agentDocContent) {
    parts.push(
      [
        "<project_instructions>",
        "Below are the project-specific instructions loaded from the repository.",
        "Follow these conventions, rules, and guidelines when working in this codebase.",
        "",
        input.agentDocContent,
        "</project_instructions>",
      ].join("\n")
    );
  }

  if (input.skillRegister && input.skillRegister.size > 0) {
    parts.push(
      [
        "<skills>",
        "Use `load_skill` to load any of these skills when relevant to the user's task:",
        "",
        input.skillRegister.getDescriptions(),
        "</skills>",
      ].join("\n")
    );
  }

  if (input.memoryContent) {
    parts.push(
      [
        "<memory_index>",
        "These are memories from previous sessions. Respect user preferences from memory.",
        "When the user says 'remember' or expresses a clear preference, it will be automatically extracted.",
        "",
        input.memoryContent,
        "</memory_index>",
      ].join("\n")
    );
  }

  const joined = parts.length > 0 ? parts.join("\n\n") : undefined;
  if (joined) {
    return joined + SYSTEM_PROMPT_DYNAMIC_BOUNDARY;
  }
  return undefined;
}

export interface DynamicTurnContextInput {
  relevantMemoryContent: string;
  todoNagReminder?: string;
  currentDate?: string;
  gitBranch?: string;
  gitStatus?: string;
  /** Plan-mode instructions (planning / ready / executing). */
  planModeContent?: string;
  /** Auto / YOLO mode instructions (only when plan is off). */
  autoModeContent?: string;
  /** Extension-contributed situational context (nested under `<extension_context>`). */
  extensionTurnContext?: string;
  /** Instruction-context re-injection (nested under `<instruction_context>`). */
  instructionContext?: string;
}

export function buildDynamicTurnContext(input: DynamicTurnContextInput): string | undefined {
  // Each section carries its own semantic tag so the model can distinguish
  // purpose: <current_date> / <git_status> / <relevant_memories> / <reminder> /
  // <plan_mode> or <auto_mode> / <instruction_context> / <extension_context>.
  const parts: string[] = [];

  if (input.currentDate) {
    parts.push(["<current_date>", input.currentDate, "</current_date>"].join("\n"));
  }

  if (input.gitBranch || input.gitStatus) {
    const gitParts: string[] = [];
    if (input.gitBranch) {
      gitParts.push(`Branch: ${input.gitBranch}`);
    }
    if (input.gitStatus) {
      gitParts.push(`Status:\n${input.gitStatus}`);
    }
    parts.push(["<git_status>", ...gitParts, "</git_status>"].join("\n"));
  }

  if (input.relevantMemoryContent) parts.push(input.relevantMemoryContent.trim());
  if (input.todoNagReminder) parts.push(input.todoNagReminder.trim());
  if (input.planModeContent) parts.push(input.planModeContent.trim());
  else if (input.autoModeContent) parts.push(input.autoModeContent.trim());

  if (input.instructionContext?.trim()) {
    parts.push(input.instructionContext.trim());
  }

  if (input.extensionTurnContext?.trim()) {
    parts.push(["<extension_context>", input.extensionTurnContext.trim(), "</extension_context>"].join("\n"));
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/**
 * Frozen system prompt only (dynamic turn context is admitted as synthetic user messages).
 *
 * `dynamicContext` / `extensionSystemAppend` are ignored here — kept in the signature so
 * older call sites compile; use {@link buildTurnContextPayload} + UI admission instead.
 */
export function buildSystemPromptWithTurnContext(
  frozen: string | undefined,
  _dynamicContext?: string | undefined,
  _extensionSystemAppend?: string
): string[] | undefined {
  return frozen ? [frozen] : undefined;
}
