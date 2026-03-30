import type { Command, CommandContext, CommandResult } from "./types.js";

const commands: Command[] = [];

export function registerCommand(command: Command): void {
  commands.push(command);
}

export function getCommand(name: string): Command | undefined {
  return commands.find((c) => c.name === name);
}

export function getAllCommands(): readonly Command[] {
  return commands;
}

function handleResult(result: CommandResult, ctx: CommandContext): void {
  if (!result.ok) {
    ctx.inputActions.setInputError(result.error);
  } else if (result.message) {
    ctx.inputActions.setInputError(result.message);
  }
}

/**
 * Try to dispatch a slash command from raw input.
 * Returns true if a command was matched and dispatched.
 */
export async function dispatchCommand(input: string, ctx: CommandContext): Promise<boolean> {
  if (!input.startsWith("/")) return false;

  const spaceIndex = input.indexOf(" ");
  const name = spaceIndex === -1 ? input.slice(1) : input.slice(1, spaceIndex);
  const args = spaceIndex === -1 ? "" : input.slice(spaceIndex + 1).trim();

  const command = getCommand(name);
  if (!command) return false;

  const result = await command.execute(args, ctx);
  handleResult(result, ctx);

  return true;
}
