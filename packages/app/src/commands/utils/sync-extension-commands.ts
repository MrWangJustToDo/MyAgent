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
    usage: `/${name} [option]`,
    // Extensions may expose browseable secondary-menu options (e.g. /skill <name>,
    // /memory <name>) fetched via dispatch — mirrors built-in /resume's getOptions.
    allowCustomInput: true,
    // Selecting an option fills `/cmd <option> ` so the user can append follow-up
    // text (e.g. /skill <name> + instructions) before sending. Extension commands
    // are content-loading by nature (skill/memory bodies), so a follow-up prompt
    // is the common intent — unlike /resume which acts immediately on selection.
    insertOnSelect: true,
    getOptions: async () => {
      const result = await session.dispatch({
        type: "extension.getCommandOptions",
        name,
      });
      if (!result.ok) return [];
      const options = (result.data as { options?: Array<{ label: string; value: string; description?: string }> })
        ?.options;
      return (options ?? []).map((o) => ({ label: o.label, value: o.value, description: o.description }));
    },
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
