import {
  isMultimodalUnsupportedError,
  unsupportedMultimodalPartTypes,
} from "../../models/adapter/capability-message-utils.js";

import type { ManagedAgent } from "../managed-agent.js";

/** Every multimodal part type — the drop set of a post-rejection retry. */
const ALL_MULTIMODAL_PART_TYPES = ["image", "audio", "video", "document"] as const;

/**
 * Arm the per-run capability strip from the model's declared capabilities.
 *
 * This does NOT edit the messages handed to the engine. `compaction` rebuilds every
 * wire call from `channel.getMessages()` and discards the incoming `config.messages`,
 * so a strip applied there reaches the first call only and is silently overwritten on
 * every later one. The drop set is stored on the run and applied by the
 * `wire-recovery` middleware, which runs after that projection.
 *
 * @returns true when a strip was armed (the model lacks at least one modality).
 */
export function armCapabilityStrip(managed: ManagedAgent): boolean {
  const drop = unsupportedMultimodalPartTypes(managed.usage ?? null);
  if (drop.size === 0) {
    managed.run.setWireDropPartTypes(null);
    return false;
  }

  managed.run.setWireDropPartTypes(drop);
  managed.log?.warn("agent", `Stripping unsupported multimodal parts for model capabilities: ${[...drop].join(", ")}`);
  return true;
}

/**
 * One-shot widened strip after a multimodal schema/API rejection: drop **every**
 * multimodal part type, not just the ones the capability probe predicted.
 *
 * Returns true when a retry is warranted (the run's drop set was widened);
 * otherwise false. The UI history is untouched — the widened set is wire-only.
 */
export function tryCapabilitySanitizeRetry(
  managed: ManagedAgent,
  error: unknown,
  multimodalStripAttempted: boolean
): boolean {
  if (multimodalStripAttempted) return false;
  if (!isMultimodalUnsupportedError(error)) return false;

  managed.run.setWireDropPartTypes(new Set(ALL_MULTIMODAL_PART_TYPES));
  managed.log?.warn(
    "agent",
    "Retrying without multimodal parts after capability/schema API error (UI history unchanged)"
  );
  managed.setError("");
  return true;
}
