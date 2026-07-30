/**
 * Shared helpers for slash-command option menus.
 */

import type { CommandOption } from "./types.js";

/** Sentinel value for freeform rows — never sent as execute args by itself. */
export const COMMAND_FREEFORM_VALUE = "__freeform__";

/**
 * Append a freeform row so users can type a custom value after selecting it
 * (or keep typing and press Enter on this row).
 */
export function withFreeformOption(
  options: CommandOption[],
  hint = "type custom…",
  description = "Use the text you typed after the command"
): CommandOption[] {
  return [
    ...options,
    {
      label: hint,
      value: COMMAND_FREEFORM_VALUE,
      description,
      freeform: true,
    },
  ];
}

/** Extract args typed after `/{name}` (trimmed). */
export function typedArgsAfterCommand(input: string, commandName: string): string {
  const prefix = `/${commandName}`;
  if (!input.startsWith(prefix)) return "";
  const rest = input.slice(prefix.length);
  if (!rest.startsWith(" ") && rest.length > 0) return rest.trim();
  return rest.trim();
}
