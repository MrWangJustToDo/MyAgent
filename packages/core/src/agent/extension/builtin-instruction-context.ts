/**
 * Built-in "instruction-context" extension — display/status layer for
 * instruction-file change detection.
 *
 * The core instruction detection lives in
 * {@link import("./agent/turn-context/instruction-context.js")} and runs inside
 * ManagedAgent's turn-context snapshot (it drives re-injection of updated
 * AGENTS.md / CLAUDE.md content). This built-in extension is the user-visible
 * companion:
 *
 * - On each user turn (`before_agent_start`), it re-reads the instruction
 *   files, detects whether they changed since the last turn, and publishes a
 *   status-bar entry (e.g. "AGENTS.md updated") via `ctx.ui.setStatus`.
 * - It also contributes a readable per-turn file-activity summary through
 *   `registerTurnContextProvider` so the model sees a lightweight note in
 *   `<extension_context>`.
 *
 * It degrades gracefully: when no instruction files exist, or reads fail, it
 * stays silent.
 */

import {
  diffInstructionStates,
  readInstructionContextState,
  type InstructionContextState,
} from "../turn-context/instruction-context.js";

import type { ExtensionAPI, ExtensionContext } from "./types.js";

export const BUILTIN_INSTRUCTION_CONTEXT_ID = "builtin-instruction-context";

/** Status-bar key used for the instruction-update entry. */
export const INSTRUCTION_STATUS_KEY = "instruction-context";

/** Readable status label when an instruction file changed. */
export function formatInstructionStatusLabel(
  diff: { primaryChanged: boolean; overrideChanged: boolean },
  primaryName: string | undefined
): string {
  const files: string[] = [];
  if (diff.primaryChanged && primaryName) files.push(primaryName);
  if (diff.overrideChanged) files.push("override");
  return files.length > 0 ? `${files.join(", ")} updated` : "";
}

export const builtinInstructionContext: ExtensionAPI = {
  id: BUILTIN_INSTRUCTION_CONTEXT_ID,
  name: "Instruction Context",
  version: "1.0.0",
  description: "Shows when AGENTS.md / CLAUDE.md instructions were updated.",
  activate(ctx: ExtensionContext) {
    let lastState: InstructionContextState | undefined = undefined;

    const refresh = async (): Promise<void> => {
      try {
        const current = await readInstructionContextState();
        const changed = lastState !== undefined && diffInstructionStates(lastState, current);
        lastState = current;

        const label = changed ? formatInstructionStatusLabel(changed, current.primary?.name) : "";
        if (label) {
          ctx.ui.setStatus(INSTRUCTION_STATUS_KEY, label);
        } else if (changed && !label) {
          ctx.ui.setStatus(INSTRUCTION_STATUS_KEY, "");
        }
      } catch {
        // Instruction reads are best-effort — stay silent on failure.
      }
    };

    ctx.registerInterceptor("before_agent_start", async () => {
      await refresh();
    });

    // Per-turn readable summary for `<extension_context>`: report the current
    // instruction source files so the model knows what governs the workspace.
    ctx.registerTurnContextProvider(() => {
      return (async () => {
        try {
          const state = await readInstructionContextState();
          if (!state.primary) return undefined;
          const parts = [`active instructions: ${state.primary.name}`];
          if (state.override) parts.push(`+ local override (${state.override.name})`);
          return parts.join(", ");
        } catch {
          return undefined;
        }
      })();
    });
  },
};
