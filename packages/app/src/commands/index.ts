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
} from "./utils/registry.js";
export {
  extensionCommandToSlashCommand,
  splitExtensionCommandArgs,
  syncExtensionCommands,
} from "./utils/sync-extension-commands.js";
export { COMMAND_FREEFORM_VALUE, typedArgsAfterCommand, withFreeformOption } from "./utils/command-options.js";

export type { Command, CommandContext, CommandOption, CommandResult } from "./utils/types.js";
