import type { ImagePart, ToolCallPart, ToolCallState } from "@tanstack/ai";

/** UI-facing tool state labels (terminal rendering). */
export type UiToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "output-denied"
  | "approval-requested"
  | "approval-responded";

export function isImagePart(part: { type?: string } | null | undefined): part is ImagePart {
  return part != null && part.type === "image";
}

export function isToolCallPart(part: { type?: string } | null | undefined): part is ToolCallPart {
  return part != null && part.type === "tool-call";
}

/**
 * Whether this settled part represents a run the USER cut short, not a tool failure.
 *
 * Two shapes exist because two layers settle aborts:
 *
 *  - `output.cancelled === true` — written by the framework fallback
 *    (`cancelInFlightToolCalls` / `cancelIncompleteToolCalls`), which settles a call that was
 *    still in flight (or whose args never finished streaming) when the run was torn down.
 *  - `output.aborted === true` — written by the `task` tool itself, which catches its
 *    subagent's cancellation and returns a normal result carrying the
 *    `[Task cancelled by user.]` notice, so the parent model learns of the cancel.
 *
 * The distinction matters to every consumer that renders a settled row: both shapes read as
 * "finished" to `getUiToolState` (one as `output-error`, one as `output-available`), so a row
 * the user cancelled would otherwise wear the failure cross or the success check. This is the
 * one predicate for that — inline summaries, status glyphs and colors all branch through it
 * rather than re-matching the output shapes.
 */
export function isCancelledToolCall(part: ToolCallPart | { output?: unknown }): boolean {
  const output = part?.output;
  if (typeof output !== "object" || output === null) return false;
  return (output as { cancelled?: boolean }).cancelled === true || (output as { aborted?: boolean }).aborted === true;
}

export function parseToolInput(part: ToolCallPart): unknown {
  if (!part.arguments) return undefined;
  try {
    return JSON.parse(part.arguments) as unknown;
  } catch {
    return part.arguments;
  }
}

export function getUiToolState(part: ToolCallPart): UiToolState {
  if (part.approval?.needsApproval && part.approval.approved === undefined) {
    return "approval-requested";
  }
  if (part.approval?.approved === false) {
    return "output-denied";
  }

  // Output means the tool finished — don't keep showing the executing spinner.
  if (part.output !== undefined) {
    if (part.state === "error") return "output-error";
    const failed =
      typeof part.output === "object" &&
      part.output !== null &&
      (part.output as { success?: boolean }).success === false;
    return failed ? "output-error" : "output-available";
  }

  if (part.approval?.approved === true && part.state !== "complete" && part.state !== "error") {
    return "approval-responded";
  }

  return mapTanStackState(part.state, part.output);
}

export function isPendingToolApproval(part: ToolCallPart): boolean {
  return getUiToolState(part) === "approval-requested";
}

function mapTanStackState(state: ToolCallState, output: unknown): UiToolState {
  switch (state) {
    case "awaiting-input":
      return "input-available";
    case "input-streaming":
      return "input-streaming";
    case "input-complete":
      return output !== undefined ? "output-available" : "input-available";
    case "approval-requested":
      return "approval-requested";
    case "approval-responded":
      return "approval-responded";
    case "complete":
      return "output-available";
    case "error":
      return "output-error";
    default:
      return "input-available";
  }
}

export function isToolExecuting(part: ToolCallPart): boolean {
  const state = getUiToolState(part);
  return state === "input-available" || state === "input-streaming" || state === "approval-responded";
}
