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

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export interface DynamicTurnContextInput {
  relevantMemoryContent: string;
  todoNagReminder?: string;
}

export function buildDynamicTurnContext(input: DynamicTurnContextInput): string | undefined {
  const parts: string[] = [];
  if (input.relevantMemoryContent) parts.push(input.relevantMemoryContent);
  if (input.todoNagReminder) parts.push(input.todoNagReminder);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
