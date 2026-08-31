/** Normal (chat) mode: typing, history, autocomplete, submit / queue. */

import { useInput } from "ink";

import { isModifiedEnter } from "../../utils/keyboard-labels.js";
import { cycleAgentMode } from "../../utils/plan-mode-toggle.js";
import { usePlanPreview } from "../use-plan-preview.js";
import { useUserInput } from "../use-user-input.js";

import { handleExtensionConfirmKeys, isAnyPanelOpen } from "./context.js";

import type { KeybindingContext } from "./context.js";

export function useNormalModeKeybindings(ctx: KeybindingContext): void {
  const {
    inputActions,
    autocompleteActions,
    commandOutputActions,
    isLoading,
    isAutocompleteVisible,
    getSession,
    acceptAutocomplete,
    handleNormalSubmit,
  } = ctx;

  useInput(
    (inputChar, inputKey) => {
      if (handleExtensionConfirmKeys(ctx, inputChar, inputKey)) return;
      // Panel open: the panel's own useInput owns the keyboard.
      if (isAnyPanelOpen()) return;

      if (inputKey.tab && inputKey.shift) {
        // Shift+Tab cycles agent mode: normal → auto → plan → normal → …
        // Still block during loading — toggling mode mid-run is not useful.
        if (isLoading) return;
        cycleAgentMode(getSession());
        return;
      }
      // Empty input + plan ready: Ctrl+P toggles full-plan markdown preview in the banner.
      // Combo key avoids accidental triggers while typing a prompt.
      if (
        !isLoading &&
        inputKey.ctrl &&
        inputChar?.toLowerCase() === "p" &&
        !inputKey.meta &&
        !useUserInput.getReadonlyState().value
      ) {
        const phase = getSession()?.getSnapshot().plan.phase;
        if (phase === "ready") {
          usePlanPreview.getActions().toggle();
          return;
        }
      }
      // Preview open + plan ready + empty input: Enter approves the plan → build, closing the preview.
      if (
        !isLoading &&
        inputKey.return &&
        !inputKey.ctrl &&
        !inputKey.meta &&
        !inputKey.shift &&
        usePlanPreview.getReadonlyState().open &&
        !useUserInput.getReadonlyState().value
      ) {
        const session = getSession();
        const phase = session?.getSnapshot().plan.phase;
        if (session && phase === "ready") {
          usePlanPreview.getActions().hide();
          void session.dispatch({ type: "plan.execute" });
          return;
        }
      }
      if (inputKey.tab) {
        // Accept autocomplete even during loading (session append/followUp is available).
        if (acceptAutocomplete(true)) return;
        return; // prevent Tab from falling through to character input
      }
      if (inputKey.return || (inputKey.ctrl && inputChar === "\n")) {
        // While running: Enter = follow-up; Option/Ctrl+Enter = force-submit.
        // Idle: Option+Enter = newline; Enter = submit.
        //
        // On macOS, Option+Enter sends \x1b\r (ESC+CR), which parseKeypress
        // detects as meta+return — this is the reliable way to insert a newline.
        // Shift+Enter sends the same \r as plain Enter and cannot be
        // distinguished, so it will submit rather than insert a newline.
        if (isLoading) {
          // When loading, accept autocomplete first if visible.
          if (acceptAutocomplete(true)) return;
          if (isModifiedEnter(inputChar, inputKey)) {
            // Option+Enter: force-submit — abort current run, inject message, start new pump.
            handleNormalSubmit("forceSubmit");
          } else if (inputKey.return) {
            // Enter: follow-up — queue message for after the current turn completes.
            handleNormalSubmit("followUp");
          }
          return;
        }
        if (isModifiedEnter(inputChar, inputKey)) {
          inputActions.append("\n");
          autocompleteActions.update(useUserInput.getReadonlyState().value);
          return;
        }
        if (!inputKey.return) return;
        if (acceptAutocomplete(true)) return;
        handleNormalSubmit("send");
        return;
      }
      if (inputKey.backspace) {
        inputActions.backspace();
        autocompleteActions.update(useUserInput.getReadonlyState().value);
        return;
      }
      // Ctrl+O toggles expand/collapse of the paste placeholder under the cursor.
      if (inputKey.ctrl && inputChar === "o") {
        inputActions.togglePasteExpansion();
        return;
      }
      if (inputKey.delete) {
        inputActions.deleteForward();
        autocompleteActions.update(useUserInput.getReadonlyState().value);
        return;
      }
      if (inputKey.leftArrow) {
        inputActions.moveCursorLeft();
        return;
      }
      if (inputKey.rightArrow) {
        inputActions.moveCursorRight();
        return;
      }
      if (inputKey.upArrow) {
        if (isAutocompleteVisible) autocompleteActions.selectPrev();
        else if (commandOutputActions.hasScroll()) commandOutputActions.scrollPrev();
        else if (!isLoading) inputActions.historyPrev();
        return;
      }
      if (inputKey.downArrow) {
        if (isAutocompleteVisible) autocompleteActions.selectNext();
        else if (commandOutputActions.hasScroll()) commandOutputActions.scrollNext();
        else if (!isLoading) inputActions.historyNext();
        return;
      }
      if (inputChar && !inputKey.ctrl && !inputKey.meta) {
        commandOutputActions.dismiss();
        if (inputChar.length > 1) {
          // Bracketed paste: react-terminal delivers the whole pasted payload
          // as a single input. Route through paste so large pastes collapse
          // into a placeholder instead of blowing up the input height.
          inputActions.paste(inputChar);
        } else {
          inputActions.append(inputChar);
        }
        autocompleteActions.update(useUserInput.getReadonlyState().value);
      }
    },
    { isActive: ctx.mode === "normal" }
  );
}
