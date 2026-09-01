import { createDeleteFileTool } from "./delete-file-tool.js";
import { createEditFileTool } from "./edit-file-tool.js";
import { createGetCommandOutputTool } from "./get-command-output-tool.js";
import { createGlobTool } from "./glob-tool.js";
import { createGrepTool } from "./grep-tool.js";
import { createKillCommandTool } from "./kill-command-tool.js";
import { createListFileTool } from "./list-file-tool.js";
import { createReadFileTool } from "./read-file-tool.js";
import { createRunCommandTool } from "./run-command-tool.js";
import { type ToolsRecord } from "./runtime/tools-record.js";
import { createTreeTool } from "./tree-tool.js";
import { createWriteFileTool } from "./write-file-tool.js";

import type { createAskUserTool } from "./ask-user-tool.js";
import type { UsageTracker } from "../../runtime-types/hosts.js";
import type { createCompletePlanTool, createCreatePlanTool, createUpdatePlanTool } from "../plan/create-plan-tool.js";
import type { createTaskTool } from "../subagent/task-tool.js";
import type { createTodoTool } from "../todo/todo-tool.js";

export type Tools = ToolsRecord & {
  delete_file: ReturnType<typeof createDeleteFileTool>;
  edit_file: ReturnType<typeof createEditFileTool>;
  list_file: ReturnType<typeof createListFileTool>;
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
  ask_user?: ReturnType<typeof createAskUserTool>;
  create_plan?: ReturnType<typeof createCreatePlanTool>;
  update_plan?: ReturnType<typeof createUpdatePlanTool>;
  complete_plan?: ReturnType<typeof createCompletePlanTool>;
};

export const createTools = async ({
  usage,
  processTools,
}: {
  usage?: UsageTracker;
  processTools?: (t: Tools) => Promise<void>;
} = {}): Promise<Tools> => {
  const res: Tools = {
    delete_file: createDeleteFileTool(),
    edit_file: createEditFileTool(),
    list_file: createListFileTool(),
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
