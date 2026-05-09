// Import command files to trigger registration
import "./compact.js";
import "./help.js";
import "./paste.js";
import "./rename.js";
import "./resume.js";

export { dispatchCommand, getAllCommands, getCommand } from "./registry.js";

export type { Command, CommandContext, CommandOption, CommandResult } from "./types.js";
