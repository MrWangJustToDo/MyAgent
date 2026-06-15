// Import command files to trigger registration
import "./clear.js";
import "./compact.js";
import "./help.js";
import "./mcp.js";
import "./paste.js";
import "./quit.js";
import "./rename.js";
import "./resume.js";
import "./usage.js";

export { dispatchCommand, getAllCommands, getCommand } from "./registry.js";

export type { Command, CommandContext, CommandOption, CommandResult } from "./types.js";
