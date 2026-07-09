import type { ModelMessage } from "@tanstack/ai";

/** Tools whose results should never be replaced with placeholders. */
export const PROTECTED_TOOLS = new Set(["skill", "load_skill", "list_skills", "compact", "todo"]);

/** Placeholder prefix for tool results dropped from the recent window. */
export const TOOL_PLACEHOLDER_PREFIX = "[Previous: used ";

export function createToolPlaceholder(toolName: string): string {
  return `${TOOL_PLACEHOLDER_PREFIX}${toolName}]`;
}

export function isToolPlaceholder(content: ModelMessage["content"]): boolean {
  if (typeof content === "string") {
    return content.startsWith(TOOL_PLACEHOLDER_PREFIX);
  }
  if (!Array.isArray(content)) return false;
  return content.some((part) => part.type === "text" && part.content?.startsWith(TOOL_PLACEHOLDER_PREFIX));
}

export function applyToolPlaceholder(message: ModelMessage, placeholder: string): void {
  if (typeof message.content === "string" || message.content === null) {
    // denied
    if (message.content?.startsWith('{"approved":false')) return;
    message.content = placeholder;
    return;
  }

  if (Array.isArray(message.content)) {
    message.content = [{ type: "text", content: placeholder }];
  }
}
