// Import command files to trigger registration
import "./paste.js";
import "./help.js";

export { dispatchCommand, getAllCommands, getCommand } from "./registry.js";

export type { Command, CommandContext, CommandResult } from "./types.js";
