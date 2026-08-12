/**
 * Bridge extension-registered slash commands into the app registry via Session.dispatch.
 */

import { clearExtensionCommands, registerExtensionCommand } from "./registry.js";

import type { Command } from "./types.js";
import type { AgentSession } from "@my-agent/core";

/** Split `/cmd a b` args string into argv for extension handlers. */
export function splitExtensionCommandArgs(args: string): string[] {
  const trimmed = args.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

function extensionSlashCommand(session: AgentSession, name: string, description: string): Command {
  return {
    name,
    description,
    usage: `/${name}`,
    execute: async (args) => {
      const result = await session.dispatch({
        type: "extension.invokeCommand",
        name,
        args: splitExtensionCommandArgs(args),
      });
      if (!result.ok) return { ok: false, error: result.error };
      const message = (result.data as { message?: string } | undefined)?.message;
      return message ? { ok: true, message } : { ok: true };
    },
  };
}

/**
 * Replace extension slash commands from the Session extensions snapshot.
 */
export function syncExtensionCommands(session: AgentSession): void {
  clearExtensionCommands();
  for (const ext of session.getSnapshot().extensions.extensions) {
    if (!ext.enabled) continue;
    for (const name of ext.commands) {
      registerExtensionCommand(extensionSlashCommand(session, name, `${ext.name}: /${name}`));
    }
  }
}
