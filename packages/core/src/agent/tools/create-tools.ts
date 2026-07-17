import { createCopyFileTool } from "./copy-file-tool.js";
import { createDeleteFileTool } from "./delete-file-tool.js";
import { createEditFileTool } from "./edit-file-tool.js";
import { createGetCommandOutputTool } from "./get-command-output-tool.js";
import { createGlobTool } from "./glob-tool.js";
import { createGrepTool } from "./grep-tool.js";
import { createKillCommandTool } from "./kill-command-tool.js";
import { createListFileTool } from "./list-file-tool.js";
import { createMoveFileTool } from "./move-file-tool.js";
import { createReadFileTool } from "./read-file-tool.js";
import { createRunCommandTool } from "./run-command-tool.js";
import { type ToolsRecord } from "./tanstack/tools-record.js";
import { createTreeTool } from "./tree-tool.js";
import { createWriteFileTool } from "./write-file-tool.js";

import type { createAskUserTool } from "./ask-user-tool.js";
import type { createListSkillsTool } from "./list-skills-tool.js";
import type { createLoadSkillTool } from "./load-skill-tool.js";
import type { createTaskTool } from "./task-tool.js";
import type { createTodoTool } from "./todo-tool.js";
import type { UsageTracker } from "../../managers/usage-tracker.js";
import type { AgentContext } from "../agent-context/agent-context.js";

export type Tools = ToolsRecord & {
  copy_file: ReturnType<typeof createCopyFileTool>;
  delete_file: ReturnType<typeof createDeleteFileTool>;
  edit_file: ReturnType<typeof createEditFileTool>;
  list_file: ReturnType<typeof createListFileTool>;
  move_file: ReturnType<typeof createMoveFileTool>;
  read_file: ReturnType<typeof createReadFileTool>;
  write_file: ReturnType<typeof createWriteFileTool>;
  glob: ReturnType<typeof createGlobTool>;
  grep: ReturnType<typeof createGrepTool>;
  tree: ReturnType<typeof createTreeTool>;
  run_command: ReturnType<typeof createRunCommandTool>;
  get_command_output: ReturnType<typeof createGetCommandOutputTool>;
  kill_command: ReturnType<typeof createKillCommandTool>;

  todo?: ReturnType<typeof createTodoTool>;
  task?: ReturnType<typeof createTaskTool>;
  list_skills?: ReturnType<typeof createListSkillsTool>;
  load_skill?: ReturnType<typeof createLoadSkillTool>;
  ask_user?: ReturnType<typeof createAskUserTool>;
};

export const createTools = async ({
  context: _context,
  usage,
  processTools,
}: {
  context?: AgentContext;
  usage?: UsageTracker;
  processTools?: (t: Tools) => Promise<void>;
} = {}): Promise<Tools> => {
  const res: Tools = {
    copy_file: createCopyFileTool(),
    delete_file: createDeleteFileTool(),
    edit_file: createEditFileTool(),
    list_file: createListFileTool(),
    move_file: createMoveFileTool(),
    read_file: createReadFileTool({ usage }),
    write_file: createWriteFileTool(),
    glob: createGlobTool(),
    grep: createGrepTool(),
    tree: createTreeTool(),
    run_command: createRunCommandTool(),
    get_command_output: createGetCommandOutputTool(),
    kill_command: createKillCommandTool(),
  };

  await processTools?.(res);

  return res;
};
