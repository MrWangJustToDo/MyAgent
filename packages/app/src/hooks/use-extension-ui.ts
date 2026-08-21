/**
 * Extension UI store. Extension → UI notifications are bridged from the session's
 * `extension-ui` channel (see {@link useExtensionUIBridge}); the UI → extension
 * direction (confirm responses) is still a no-op until a Session → extension
 * channel exists.
 */

import { useCallback, useEffect } from "react";
import { createState, toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";
import { useUserInput } from "./use-user-input.js";

interface ConfirmState {
  id: string;
  question: string;
}

interface WidgetState {
  id: string;
  component: string;
  props: Record<string, unknown>;
}

export const useExtensionUI = createState(
  () => ({
    statusText: null as string | null,
    confirm: null as ConfirmState | null,
    widgets: [] as WidgetState[],
  }),
  {
    withActions: (s) => ({
      setStatusText: (text: string | null) => {
        s.statusText = text;
      },
      setConfirm: (confirm: ConfirmState | null) => {
        s.confirm = confirm;
      },
      addWidget: (widget: WidgetState) => {
        const idx = s.widgets.findIndex((w) => w.id === widget.id);
        if (idx >= 0) {
          s.widgets[idx] = widget;
        } else {
          s.widgets.push(widget);
        }
      },
      removeWidget: (id: string) => {
        s.widgets = s.widgets.filter((w) => w.id !== id);
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
  }
);

/**
 * Bridge extension UI notifications from the active session into the UI store.
 *
 * Session-only cutover removed the direct ExtensionRunner bridge (app no longer
 * touches ManagedAgent). This hook reconnects the extension → UI path through
 * the session's `extension-ui` channel: the core session forwards events published
 * via `ExtensionUI` (set-status / notify / set-widget / confirm) and this hook
 * projects them into {@link useExtensionUI} for the footer, widgets, and confirms.
 *
 * Confirm responses are still a no-op until a Session → extension channel exists.
 */
export function useExtensionUIBridge(): void {
  const session = toRaw(useAgent((s) => s.session));

  useEffect(() => {
    if (!session) return;

    return session.subscribe(
      (event) => {
        if (event.channel !== "extension-ui") return;
        const ui = useExtensionUI.getActions();
        const payload = event.payload;
        switch (payload.type) {
          case "set-status":
            // Empty text from the extension runner means "remove this status entry"
            // (a disabled extension had its footer state cleared). Normalize to null
            // so the footer treats it as absent rather than a blank string.
            ui.setStatusText(payload.text ? payload.text : null);
            break;
          case "notify":
            useUserInput.getActions().setInputFeedback(payload.message, payload.level ?? "info");
            break;
          case "set-widget":
            ui.addWidget({ id: payload.id, component: payload.component, props: payload.props });
            break;
          case "confirm":
            ui.setConfirm({ id: payload.id, question: payload.question });
            break;
        }
      },
      { channels: ["extension-ui"] }
    );
  }, [session]);
}

export function useRespondToConfirm(): (id: string, ok: boolean) => void {
  return useCallback((_id: string, _ok: boolean) => {
    useExtensionUI.getActions().setConfirm(null);
  }, []);
}
