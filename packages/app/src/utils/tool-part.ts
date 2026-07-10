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

export function isImagePart(part: { type?: string }): part is ImagePart {
  return part.type === "image";
}

export function isToolCallPart(part: { type?: string }): part is ToolCallPart {
  return part.type === "tool-call";
}

export function isToolResultPart(part: { type?: string }): boolean {
  return part.type === "tool-result";
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
