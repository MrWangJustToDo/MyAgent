/**
 * Persist a mid-session `models.json` edit and make it live.
 *
 * The first-run wizard could stop at "write the file": startup continued through
 * the unified pipeline and read it back. Mid-session there is no restart, so a
 * save has to do the second half too, in the same order `initConfig` does:
 *
 * 1. merge the wizard draft into the **raw file on disk** (see
 *    {@link mergeModelsConfig}) and write it back, so nothing the wizard cannot
 *    represent is lost — not other entries, not `global`, not keys this build's
 *    schema does not declare;
 * 2. re-read the **written file** through `loadModels({ kind: "file" })` — not the
 *    in-memory draft — so the live provider is exactly what the next start reads;
 * 3. register the matching provider;
 * 4. update the config store's entry list (`modelsConfig`). The connection fields
 *    (`config.model` / `style` / `baseURL` / `apiKey`) are deliberately NOT written:
 *    the running session keeps its own connection, and re-picking the model is
 *    `/models`' job (`applyModelSelection`).
 *
 * The running session is deliberately not torn down: `useAgentChat` does not
 * depend on the connection fields, and `/models` already switches a live session
 * through `session.dispatch({ type: "model.set" })`. Editing the connection of
 * the running entry therefore applies on the next message, and the user can
 * re-pick with `/models` if the new list drops the current model.
 */

import {
  loadModels,
  readModelsConfigFile,
  registerModelProviderForEntry,
  writeModelsConfigFile,
  type LoadedModelsState,
  type ModelsConfig,
  type RawModelsConfig,
} from "@codent/core";

import { useConfig } from "../hooks/use-config.js";

import { mergeModelsConfig } from "./merge-models-config.js";

export interface ApplyModelsConfigEditOptions {
  /** Entry the wizard was seeded from (defaults to the file's active entry). */
  entryIndex?: number;
}

export type ApplyModelsConfigEditResult =
  | {
      ok: true;
      config: RawModelsConfig;
      /** Reloaded pipeline state, or `null` when the reload failed (see `reloadError`). */
      loaded: LoadedModelsState | null;
      model?: string;
      /**
       * The file was written, but the live pipeline could not be rebuilt — e.g. a
       * sibling `remote-provider` entry whose server is unreachable (`loadModels`
       * fetches every remote entry). The write stands and the edit is not rolled
       * back; the new connection applies on restart instead of immediately.
       */
      reloadError?: string;
    }
  | { ok: false; error: string };

/**
 * Save a wizard draft into `.agents/config/models.json` and reload the pipeline.
 */
export async function applyModelsConfigEdit(
  draft: ModelsConfig,
  options: ApplyModelsConfigEditOptions = {}
): Promise<ApplyModelsConfigEditResult> {
  try {
    // Read the **raw** document (no schema, no stripping) and merge against it.
    // Two reasons this is not `loadModelsConfigFromFile`:
    // - validation would drop every key the schema does not declare (`$schema`, a
    //   hand-written `headers`, a `global` field a newer build knows), so the write
    //   would silently delete the user's own fields;
    // - the file — not the in-memory store — is what must be preserved. The store
    //   can legitimately be empty (a config that failed to load, or a session
    //   started before the file existed), and merging against that would drop every
    //   entry the user already had.
    const existing = await readModelsConfigFile();
    const merged = mergeModelsConfig(existing, draft, options);

    await writeModelsConfigFile(merged);

    // Read back what was actually written — the merge and the schema both get a
    // vote here, so a live provider can never disagree with the file. The write is
    // already durable, so a reload failure must NOT be reported as a failed edit
    // and must not be rolled back: it degrades to "restart to apply".
    try {
      const loaded = await loadModels({ kind: "file" });
      if (loaded) {
        await registerModelProviderForEntry(loaded);
        useConfig.getActions().setModelsConfig(loaded);
      }
      return { ok: true, config: merged, loaded, model: loaded?.active.model };
    } catch (reloadFailure) {
      return {
        ok: true,
        config: merged,
        loaded: null,
        reloadError: reloadFailure instanceof Error ? reloadFailure.message : String(reloadFailure),
      };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
