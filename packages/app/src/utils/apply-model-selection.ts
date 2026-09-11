/**
 * Apply a `models.json` selection to a live session.
 *
 * Shared by the `/models` command and the resume-time re-link in `useAgentChat`.
 * Both need the same three effects, in order:
 *
 * 1. register the target provider entry (remote-provider entries must be re-registered),
 * 2. dispatch `model.set` **with the entry's connection** (`modelStyle` /
 *    `modelBaseURL` / `modelApiKey`) plus resolved `modelInfo`,
 * 3. sync the app config (`config.model` + connection fields, or the display-only
 *    `config.serverModel` for `session` entries) and the active entry.
 *
 * Step 2 matters on resume: core adopts the session's persisted model string, but
 * `SessionData` does not store the connection — without re-dispatching here a
 * restored session would run its saved model against whatever baseURL/apiKey the
 * ambient config happens to hold (usually the previous entry).
 */

import {
  registerModelProviderForEntry,
  resolveModelInfoFromModelsDev,
  type AgentSession,
  type LoadedModelsState,
} from "@my-agent/core";
import { toRaw } from "reactivity-store";

import { useConfig } from "../hooks/use-config.js";

export type ModelSelectionResult = { ok: true } | { ok: false; error: string };

/**
 * Deep-clone the loaded models config so entries/models are plain mutable data
 * (the store wraps them in readonly proxies, which provider registration rejects).
 */
export function getLoadedModelsState(): LoadedModelsState | null {
  const raw = toRaw(useConfig.getReadonlyState().modelsConfig) as unknown as LoadedModelsState | null;
  if (!raw) return null;
  return JSON.parse(JSON.stringify(raw)) as LoadedModelsState;
}

/** Index of the first entry offering `model`, preferring the active entry. */
export function findModelEntry(state: LoadedModelsState, model: string): number {
  const active = state.active.entryIndex;
  if (state.entries[active]?.models.includes(model)) return active;
  return state.entries.findIndex((entry) => entry.models.includes(model));
}

export async function applyModelSelection(
  session: AgentSession,
  state: LoadedModelsState,
  entryIndex: number,
  model: string
): Promise<ModelSelectionResult> {
  const entry = state.entries[entryIndex];
  if (!entry) return { ok: false, error: `Invalid entry index ${entryIndex}` };

  // Session entries (remote-session host) skip registration entirely — the
  // server-side session resolves the connection itself on `model.set`.
  if (entry.type !== "session") {
    await registerModelProviderForEntry({ ...state, active: { entryIndex, model } });
  }

  const modelInfo = await resolveModelInfoFromModelsDev(model, entry.style);
  const result = await session.dispatch({
    type: "model.set",
    model,
    // Session entries carry no baseURL/apiKey — upstream credentials stay on the
    // agent server, which resolves them from its own models.json/.env.
    ...(entry.type !== "session" && {
      modelStyle: entry.style,
      modelBaseURL: entry.baseURL,
      modelApiKey: entry.apiKey,
    }),
    modelInfo: modelInfo ?? null,
  });
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Failed to switch model" };
  }

  // Keep the app config (footer / help / usage) and the active entry in sync so a
  // restart resumes at this model.
  useConfig.getActions().selectModel(entryIndex, model, entry);
  return { ok: true };
}
