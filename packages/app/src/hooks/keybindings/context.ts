/**
 * Shared context for the central keybinding handlers.
 *
 * Ink broadcasts every keystroke to ALL registered `useInput` handlers, so
 * every mode handler must early-return when an overlay panel owns the
 * keyboard (`isAnyPanelOpen`) or the extension confirm dialog is up.
 */

import { useExtensionPanel } from "../use-extension-panel.js";
import { useSubagentPanel } from "../use-subagent-panel.js";
import { useWorkspaceView } from "../use-workspace-view.js";

import type { useAutocomplete, useCommandOutput, useSelect, useUserInput } from "..";
import type { AgentAdapter } from "../../adapter/types.js";
import type { CommandContext } from "../../commands";
import type { UseAgentChatReturn } from "../use-agent-chat.js";
import type { InputMode, useInputMode } from "../use-input-mode.js";
import type { AgentSession } from "@my-agent/core";
import type { Key } from "ink";
import type { MutableRefObject } from "react";

export interface DenyingToolInfo {
  id: string;
  isLast: boolean;
  toolCallId?: string;
  toolName?: string;
}

/** Active extension UI confirm dialog payload. */
export interface ExtensionConfirmDialog {
  id: string;
  question: string;
}

/** Everything a keybinding handler may need, built once per render. */
export interface KeybindingContext {
  adapter: AgentAdapter;
  mode: InputMode;
  isLoading: boolean;
  isAutocompleteVisible: boolean;
  currentPendingIsLast: boolean;
  pendingApproval: UseAgentChatReturn["allPendingApproval"][number] | undefined;
  pendingAskUser: UseAgentChatReturn["allPendingAskUser"][number] | undefined;
  inputActions: ReturnType<typeof useUserInput.getActions>;
  autocompleteActions: ReturnType<typeof useAutocomplete.getActions>;
  selectActions: ReturnType<typeof useSelect.getActions>;
  commandOutputActions: ReturnType<typeof useCommandOutput.getActions>;
  modeActions: ReturnType<typeof useInputMode.getActions>;
  denyingRef: MutableRefObject<DenyingToolInfo | null>;
  commandCtx: CommandContext;
  stop: UseAgentChatReturn["stop"];
  acceptAutocomplete: (triggerSubmit: boolean) => boolean;
  handleNormalSubmit: (behavior?: "send" | "steer" | "followUp" | "forceSubmit") => void;
  /**
   * Submit an ask_user answer. `meta` carries structured multi-select info
   * (selected option labels + free-form draft) so the UI and the model-facing
   * result can clearly represent a multi-choice answer.
   */
  submitAskUserAnswer: (answer: string, meta?: { selected?: string[]; draft?: string }) => void;
  addToolApprovalResponse: UseAgentChatReturn["addToolApprovalResponse"];
  extensionConfirm: ExtensionConfirmDialog | null;
  onExtensionConfirmRespond: (id: string, ok: boolean) => void;
  /** Resolved active session accessor (root or child). */
  getSession: () => AgentSession | null;
}

/**
 * Any overlay panel (workspace browser / task / extensions) is open. While a
 * panel is up, its own `useInput` owns the keyboard — central handlers must
 * early-return or panel navigation leaks into chat input / approvals
 * (arrows mutating history, Enter submitting, `y` approving a tool, …).
 */
export function isAnyPanelOpen(): boolean {
  return (
    useWorkspaceView.getReadonlyState().view === "workspace" ||
    useSubagentPanel.getReadonlyState().view !== "closed" ||
    useExtensionPanel.getReadonlyState().view !== "closed"
  );
}

/**
 * Guard for the extension UI confirm dialog: consumes y/n/Esc and swallows
 * everything else so keys are not treated as chat input. Global shortcuts
 * (Ctrl+C / Ctrl+T / …) fall through.
 */
export function handleExtensionConfirmKeys(
  ctx: Pick<KeybindingContext, "extensionConfirm" | "onExtensionConfirmRespond">,
  inputChar: string,
  inputKey: Key
): boolean {
  const confirm = ctx.extensionConfirm;
  if (!confirm) return false;
  if (inputKey.ctrl || inputKey.meta) return false;
  const char = inputChar?.toLowerCase();
  if (char === "y") {
    ctx.onExtensionConfirmRespond(confirm.id, true);
    return true;
  }
  if (char === "n" || inputKey.escape) {
    ctx.onExtensionConfirmRespond(confirm.id, false);
    return true;
  }
  // Swallow all other keys so they are not treated as chat input.
  return true;
}
