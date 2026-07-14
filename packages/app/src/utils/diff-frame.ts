import { BG } from "../theme/colors.js";

/** Resolve edit/write diff frame color from approval state (single border for status). */
export function approvalFrameColor(approved: boolean | undefined): string {
  if (typeof approved === "boolean") return approved ? BG.borderSuccess : BG.borderDanger;
  return BG.border;
}
