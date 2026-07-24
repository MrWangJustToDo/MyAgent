// Import command files to trigger registration
import "./clear.js";
import "./compact.js";
import "./display.js";
import "./help.js";
import "./mcp.js";
import "./paste.js";
import "./plan.js";
import "./quit.js";
import "./rename.js";
import "./resume.js";
import "./shortcuts.js";
import "./theme.js";
import "./usage.js";

export {
  clearExtensionCommands,
  dispatchCommand,
  getAllCommands,
  getCommand,
  registerExtensionCommand,
} from "./registry.js";
export {
  extensionCommandToSlashCommand,
  splitExtensionCommandArgs,
  syncExtensionCommands,
} from "./sync-extension-commands.js";
export { COMMAND_FREEFORM_VALUE, typedArgsAfterCommand, withFreeformOption } from "./command-options.js";

export type { Command, CommandContext, CommandOption, CommandResult } from "./types.js";
