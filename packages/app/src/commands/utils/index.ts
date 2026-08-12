export {
  clearExtensionCommands,
  dispatchCommand,
  getAllCommands,
  getCommand,
  registerCommand,
  registerExtensionCommand,
} from "./registry.js";
export { splitExtensionCommandArgs, syncExtensionCommands } from "./sync-extension-commands.js";
export { COMMAND_FREEFORM_VALUE, typedArgsAfterCommand, withFreeformOption } from "./command-options.js";

export type { Command, CommandContext, CommandOption, CommandResult } from "./types.js";
