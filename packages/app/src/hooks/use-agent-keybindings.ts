/**
 * Central keybinding orchestrator — builds the shared {@link KeybindingContext}
 * and registers one `useInput` handler per input mode.
 *
 * Mode handlers live in `hooks/keybindings/*`; each must early-return while an
 * overlay panel or the extension confirm dialog owns the keyboard (Ink
 * broadcasts every keystroke to all handlers — see keybindings/context.ts).
 */

import { getActiveSession } from "../utils/session-resolve.js";

import { useApprovalModeKeybindings } from "./keybindings/approval.js";
import { useFreeformModeKeybindings } from "./keybindings/freeform.js";
import { useGlobalKeybindings } from "./keybindings/global.js";
import { useNormalModeKeybindings } from "./keybindings/normal.js";
import { useSelectModeKeybindings } from "./keybindings/select.js";

import type { useAutocomplete, useCommandOutput, useInputMode, useSelect, useUserInput } from ".";
import type { KeybindingContext } from "./keybindings/context.js";

export interface UseAgentKeybindingsOptions extends Omit<
  KeybindingContext,
  "getSession" | "modeActions" | "inputActions" | "autocompleteActions" | "selectActions" | "commandOutputActions"
> {
  inputActions: ReturnType<typeof useUserInput.getActions>;
  autocompleteActions: ReturnType<typeof useAutocomplete.getActions>;
  selectActions: ReturnType<typeof useSelect.getActions>;
  commandOutputActions: ReturnType<typeof useCommandOutput.getActions>;
  modeActions: ReturnType<typeof useInputMode.getActions>;
}

export function useAgentKeybindings(options: UseAgentKeybindingsOptions): void {
  const ctx: KeybindingContext = {
    ...options,
    getSession: () => getActiveSession(),
  };

  useGlobalKeybindings(ctx);
  useNormalModeKeybindings(ctx);
  useApprovalModeKeybindings(ctx);
  useSelectModeKeybindings(ctx);
  useFreeformModeKeybindings(ctx);
}
