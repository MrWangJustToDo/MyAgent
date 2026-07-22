import { useCallback, useEffect } from "react";
import { createState, toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";
import { useUserInput } from "./use-user-input.js";

import type { ManagedAgent } from "@my-agent/core";

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
    notifyExtension: null as ((type: string, data: unknown) => void) | null,
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
      setNotifyExtension: (fn: ((type: string, data: unknown) => void) | null) => {
        s.notifyExtension = fn;
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
  }
);

export function useExtensionUIBridge(): void {
  const agent = toRaw(useAgent((s) => s.agent)) as ManagedAgent | null;

  useEffect(() => {
    const runner = agent?.extensionRunner;
    const ui = runner?.getUI();
    if (!ui) return;

    useExtensionUI.getActions().setNotifyExtension((type, data) => ui.notify(type, data));

    const unsubs = [
      ui.subscribe<{ message: string; level?: "success" | "info" | "error" }>("notify", (data) => {
        useUserInput.getActions().setInputFeedback(data.message, data.level ?? "info");
      }),

      ui.subscribe<{ text: string }>("set-status", (data) => {
        useExtensionUI.getActions().setStatusText(data.text);
      }),

      ui.subscribe<{ id: string; question: string }>("confirm", (data) => {
        useExtensionUI.getActions().setConfirm({ id: data.id, question: data.question });
      }),

      ui.subscribe<{ id: string; component: string; props: Record<string, unknown> }>("set-widget", (data) => {
        useExtensionUI.getActions().addWidget({
          id: data.id,
          component: data.component,
          props: data.props,
        });
      }),

      ui.subscribe<{ id: string }>("remove-widget", (data) => {
        useExtensionUI.getActions().removeWidget(data.id);
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
      useExtensionUI.getActions().setNotifyExtension(null);
    };
  }, [agent?.extensionRunner]);
}

export function useRespondToConfirm(): (id: string, ok: boolean) => void {
  return useCallback((id: string, ok: boolean) => {
    const notify = useExtensionUI.getReadonlyState().notifyExtension;
    if (notify) {
      notify("confirm:result", { id, ok });
    }
    useExtensionUI.getActions().setConfirm(null);
  }, []);
}
