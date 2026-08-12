/**
 * Extension UI store. Live ExtensionRunner bridge removed (Session-only); keep
 * confirm/status slots for future Session channels. Confirm respond is a no-op
 * until a Session extension-ui channel exists.
 */

import { useCallback } from "react";
import { createState } from "reactivity-store";

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

/** No-op until extension UI is projected over Session. */
export function useExtensionUIBridge(): void {}

export function useRespondToConfirm(): (id: string, ok: boolean) => void {
  return useCallback((_id: string, _ok: boolean) => {
    useExtensionUI.getActions().setConfirm(null);
  }, []);
}
