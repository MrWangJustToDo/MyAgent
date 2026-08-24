import { isToolCallPart } from "./tool-part.js";

import type { UIMessage } from "@tanstack/ai";

/**
 * Tool call ids whose complex output blocks (todo list, command output) are
 * collapsed to their one-line header summary.
 *
 * Complex blocks lose value as history — a todo list re-renders in full on every
 * update and command output is superseded by later runs. Only the most recent
 * completed block of each kind stays expanded; failed commands always stay
 * expanded so errors remain visible.
 */
export function computeCollapsedToolOutputs(messages: UIMessage[]): ReadonlySet<string> {
  const todoIds: string[] = [];
  const commandIds: string[] = [];

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (!isToolCallPart(part) || part.state !== "complete") continue;
      if (part.name === "todo") {
        todoIds.push(part.id);
      } else if (part.name === "run_command") {
        const success = (part.output as { success?: boolean } | undefined)?.success;
        // Failed output stays visible regardless of position.
        if (success !== false) commandIds.push(part.id);
      }
    }
  }

  if (todoIds.length === 0 && commandIds.length === 0) return new Set<string>();

  const collapsed = new Set<string>();
  for (const id of todoIds.slice(0, -1)) collapsed.add(id);
  for (const id of commandIds.slice(0, -1)) collapsed.add(id);
  return collapsed;
}
