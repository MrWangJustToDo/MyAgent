/**
 * Extension UI store.
 *
 * Extension → UI notifications are bridged from the session's `extension-ui`
 * channel: extensions publish generic render payloads into named surfaces
 * (`render`) plus host-native notifications (`notify`). The host owns rendering;
 * there is no predefined extension component vocabulary.
 *
 * There is intentionally no UI → extension channel: extension interaction
 * (confirm dialogs and the like) is out of scope for this design.
 */

import { useEffect } from "react";
import { createState, toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";
import { useUserInput } from "./use-user-input.js";

import type { ExtensionRenderPayload } from "@my-agent/core";

/** surface → key → payload. */
export type ExtensionSurfaceSlots = Record<string, Record<string, ExtensionRenderPayload>>;

/** Structural comparison so an identical republish never re-renders the host. */
function samePayload(a: ExtensionRenderPayload | null, b: ExtensionRenderPayload | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export const useExtensionUI = createState(
  () => ({
    surfaces: {} as ExtensionSurfaceSlots,
  }),
  {
    withActions: (s) => ({
      /**
       * Write (or remove, with `null`) one surface slot. Surfaces/keys are owned
       * by the publishing extension in core; the host only mirrors them.
       */
      setSlot: (surface: string, key: string, payload: ExtensionRenderPayload | null) => {
        const current = s.surfaces[surface] ?? {};
        if (samePayload(current[key] ?? null, payload)) return;
        const next: Record<string, ExtensionRenderPayload> = {};
        for (const [existingKey, existing] of Object.entries(current)) {
          if (existingKey !== key) next[existingKey] = existing;
        }
        if (payload !== null) next[key] = payload;
        // Always reassign so the reactive store notifies subscribers.
        s.surfaces[surface] = next;
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
  }
);

/**
 * Bridge extension UI notifications from the active session into the UI store.
 *
 * The session's `extension-ui` channel carries everything an extension published
 * via `ExtensionUI` (`render` / `notify` / `context`); this hook projects the
 * render slots into {@link useExtensionUI} and host notifications into the input
 * feedback line.
 */
export function useExtensionUIBridge(): void {
  const session = toRaw(useAgent((s) => s.session));

  useEffect(() => {
    if (!session) return;

    return session.subscribe(
      (event) => {
        if (event.channel !== "extension-ui") return;
        const payload = event.payload;
        switch (payload.type) {
          case "render":
            useExtensionUI.getActions().setSlot(payload.surface, payload.key, payload.payload);
            break;
          case "notify":
            useUserInput.getActions().setInputFeedback(payload.message, payload.level ?? "info");
            break;
          case "context":
            // Context snapshots target in-process extensions; hosts already track
            // the state they render from via their own channels.
            break;
        }
      },
      { channels: ["extension-ui"] }
    );
  }, [session]);
}
