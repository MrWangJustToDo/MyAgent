import { createCopyFileTool } from "./copy-file-tool.js";
import { createDeleteFileTool } from "./delete-file-tool.js";
import { createEditFileTool } from "./edit-file-tool.js";
import { createFetchUrlTool } from "./fetch-url-tool.js";
import { createGlobTool } from "./glob-tool.js";
import { createGrepTool } from "./grep-tool.js";
import { createListCommandTool } from "./list-command-tool.js";
import { createListFileTool } from "./list-file-tool.js";
import { createManCommandTool } from "./man-command-tool.js";
import { createMoveFileTool } from "./move-file-tool.js";
import { createReadFileTool } from "./read-file-tool.js";
import { createRunCommandTool } from "./run-command-tool.js";
import { createSearchReplaceTool } from "./search-replace-tool.js";
import { createTreeTool } from "./tree-tool.js";
import { createWriteFileTool } from "./write-file-tool.js";

import type { createCompactTool } from "./compact-tool.js";
import type { createListSkillsTool } from "./list-skills-tool.js";
import type { createLoadSkillTool } from "./load-skill-tool.js";
import type { createTaskTool } from "./task-tool.js";
import type { createTodoTool } from "./todo-tool.js";
import type { Sandbox } from "../../environment";

export * from "./copy-file-tool.js";
export * from "./delete-file-tool.js";
export * from "./edit-file-tool.js";
export * from "./fetch-url-tool.js";
export * from "./glob-tool.js";
export * from "./grep-tool.js";
export * from "./list-command-tool.js";
export * from "./list-file-tool.js";
export * from "./man-command-tool.js";
export * from "./move-file-tool.js";
export * from "./read-file-tool.js";
export * from "./run-command-tool.js";
export * from "./search-replace-tool.js";
export * from "./todo-tool.js";
export * from "./tree-tool.js";
export * from "./types.js";
export * from "./write-file-tool.js";
export * from "./task-tool.js";
export * from "./list-skills-tool.js";
export * from "./load-skill-tool.js";
export * from "./compact-tool.js";

export type Tools = {
  copy_file: ReturnType<typeof createCopyFileTool>;
  delete_file: ReturnType<typeof createDeleteFileTool>;
  edit_file: ReturnType<typeof createEditFileTool>;
  list_file: ReturnType<typeof createListFileTool>;
  move_file: ReturnType<typeof createMoveFileTool>;
  read_file: ReturnType<typeof createReadFileTool>;
  write_file: ReturnType<typeof createWriteFileTool>;
  fetch_url: ReturnType<typeof createFetchUrlTool>;
  glob: ReturnType<typeof createGlobTool>;
  grep: ReturnType<typeof createGrepTool>;
  tree: ReturnType<typeof createTreeTool>;
  list_command: ReturnType<typeof createListCommandTool>;
  man_command: ReturnType<typeof createManCommandTool>;
  run_command: ReturnType<typeof createRunCommandTool>;
  search_replace: ReturnType<typeof createSearchReplaceTool>;
  todo?: ReturnType<typeof createTodoTool>;
  task?: ReturnType<typeof createTaskTool>;
  list_skills?: ReturnType<typeof createListSkillsTool>;
  load_skill?: ReturnType<typeof createLoadSkillTool>;
  compact?: ReturnType<typeof createCompactTool>;
};

export const createTools = async ({
  sandbox,
  processTools,
}: {
  sandbox: Sandbox;
  processTools?: (t: Tools) => Promise<void>;
}): Promise<Tools> => {
  const res: Tools = {
    copy_file: createCopyFileTool({ sandbox }),
    delete_file: createDeleteFileTool({ sandbox }),
    edit_file: createEditFileTool({ sandbox }),
    list_file: createListFileTool({ sandbox }),
    move_file: createMoveFileTool({ sandbox }),
    read_file: createReadFileTool({ sandbox }),
    write_file: createWriteFileTool({ sandbox }),
    fetch_url: createFetchUrlTool({ sandbox }),
    glob: createGlobTool({ sandbox }),
    grep: createGrepTool({ sandbox }),
    tree: createTreeTool({ sandbox }),
    list_command: createListCommandTool({ sandbox }),
    man_command: createManCommandTool({ sandbox }),
    run_command: createRunCommandTool({ sandbox }),
    search_replace: createSearchReplaceTool({ sandbox }),
  };

  await processTools?.(res);

  return res;
};
