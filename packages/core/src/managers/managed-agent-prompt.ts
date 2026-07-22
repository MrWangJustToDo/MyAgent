import type { AgentConfig } from "./agent-types.js";
import type { SkillRegistry } from "../agent/skills";

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

/**
 * Separator between static and dynamic parts of the system prompt.
 * Content before this marker is eligible for API-level prompt caching (Anthropic, OpenAI).
 * Content after changes per-turn and cannot use global cache.
 */
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "\n<SYSTEM_PROMPT_DYNAMIC_BOUNDARY>\n";

export interface DynamicTurnContextInput {
  relevantMemoryContent: string;
  todoNagReminder?: string;
  currentDate?: string;
  gitBranch?: string;
  gitStatus?: string;
}

export function buildDynamicTurnContext(input: DynamicTurnContextInput): string | undefined {
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

  if (input.relevantMemoryContent) parts.push(input.relevantMemoryContent);
  if (input.todoNagReminder) parts.push(input.todoNagReminder);

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/**
 * Append per-turn dynamic context after {@link SYSTEM_PROMPT_DYNAMIC_BOUNDARY}.
 * Conversation messages stay free of synthetic turn_context pairs (prefix-cache friendly).
 */
export function buildSystemPromptWithTurnContext(
  frozen: string | undefined,
  dynamicContext: string | undefined
): string[] | undefined {
  if (!frozen && !dynamicContext) return undefined;
  if (!dynamicContext) return frozen ? [frozen] : undefined;

  const block = `<turn_context>\n${dynamicContext}\n</turn_context>`;
  if (!frozen) {
    return [SYSTEM_PROMPT_DYNAMIC_BOUNDARY + block];
  }
  if (frozen.includes("<SYSTEM_PROMPT_DYNAMIC_BOUNDARY>")) {
    return [frozen + block];
  }
  return [frozen + SYSTEM_PROMPT_DYNAMIC_BOUNDARY + block];
}
