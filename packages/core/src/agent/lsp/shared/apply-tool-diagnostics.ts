import type { ToolAfterPayload } from "../../extension/types.js";

/**
 * Attach LSP diagnostic text to a tool-after payload for the model/UI pipeline.
 *
 * Sets `modifiedResult` so `extensions-middleware` applies it in
 * `onToolPhaseComplete` (in-place `result` mutation alone is not reliable).
 */
export function applyDiagnosticsToToolAfterPayload(payload: ToolAfterPayload, summary: string): void {
  const trimmed = summary.trim();
  const base = payload.modifiedResult ?? payload.result;

  if (base != null && typeof base === "object" && !Array.isArray(base)) {
    payload.modifiedResult = { ...(base as Record<string, unknown>), _lspDiagnostics: trimmed };
    return;
  }

  if (typeof base === "string") {
    payload.modifiedResult = base + (trimmed.startsWith("\n") ? trimmed : `\n\n${trimmed}`);
  }
}
