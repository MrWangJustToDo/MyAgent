import type { useUserInput } from "../hooks/use-user-input.js";

/**
 * Context passed to every command's execute function.
 */
export interface CommandContext {
  /** Actions from useUserInput */
  inputActions: ReturnType<typeof useUserInput.getActions>;
  /** Get readonly snapshot of current input state */
  getInputState: () => ReturnType<typeof useUserInput.getReadonlyState>;
}

/**
 * Result returned from a command execution.
 */
export type CommandResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * A slash command definition.
 */
export interface Command {
  /** Command name without leading slash (e.g. "attach") */
  name: string;
  /** Short description for /help output */
  description: string;
  /** Usage string (e.g. "/attach <file-path>") */
  usage: string;
  /** Execute the command. `args` is everything after "/name " trimmed. */
  execute: (args: string, ctx: CommandContext) => CommandResult | Promise<CommandResult>;
}
