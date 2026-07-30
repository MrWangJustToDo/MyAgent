/**
 * Bridge extension-registered commands into the app slash-command registry.
 */

import { clearExtensionCommands, registerExtensionCommand } from "./registry.js";

import type { Command } from "./types.js";
import type { ExtensionCommand, ManagedAgent } from "@my-agent/core";

/** Split `/cmd a b` args string into argv for extension handlers. */
export function splitExtensionCommandArgs(args: string): string[] {
  const trimmed = args.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

/** Map a core {@link ExtensionCommand} to an app {@link Command}. */
export function extensionCommandToSlashCommand(cmd: ExtensionCommand): Command {
  return {
    name: cmd.name,
    description: cmd.description,
    usage: `/${cmd.name}`,
    execute: async (args) => {
      const argv = splitExtensionCommandArgs(args);
      try {
        const message = await cmd.execute(argv);
        return message ? { ok: true, message } : { ok: true };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return { ok: false, error: err.message };
      }
    },
  };
}

/**
 * Replace the extension command layer with commands from the managed agent.
 * Built-in slash commands are never overwritten (conflicts are skipped with a warning).
 */
export function syncExtensionCommands(agent: ManagedAgent): void {
  clearExtensionCommands();
  for (const cmd of agent.getExtensionCommands()) {
    registerExtensionCommand(extensionCommandToSlashCommand(cmd));
  }
}
