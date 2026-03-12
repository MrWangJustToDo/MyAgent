import { createCopyFileTools } from "./copyFileTool";
import { createDeleteFileTool } from "./deleteFileTool";
import { createEditFileTool } from "./editFileTool";
import { createFetchUrlTool } from "./fetchUrlTool";
import { createGlobTool } from "./globTool";
import { createGrepTool } from "./grepTool";
import { createListCommandTool } from "./listCommandTool";
import { createListFileTool } from "./listFileTool";
import { createManCommandTool } from "./manCommandTool";
import { createMoveFileTool } from "./moveFileTool";
import { createReadFileTool } from "./readFileTool";
import { createRunCommandTool } from "./runCommandTool";
import { createSearchReplaceTool } from "./searchReplaceTool";
import { createTreeTool } from "./treeTool";
import { createWriteFileTool } from "./writeFileTool";

import type { Sandbox } from "../../environment";

export * from "./copyFileTool";
export * from "./deleteFileTool";
export * from "./editFileTool";
export * from "./fetchUrlTool";
export * from "./globTool";
export * from "./grepTool";
export * from "./listCommandTool";
export * from "./listFileTool";
export * from "./manCommandTool";
export * from "./moveFileTool";
export * from "./readFileTool";
export * from "./runCommandTool";
export * from "./searchReplaceTool";
export * from "./treeTool";
export * from "./writeFileTool";

export type Tools = {
  copy_file: ReturnType<typeof createCopyFileTools>;
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
};

export const createTools = ({ sandbox }: { sandbox: Sandbox }): Tools => {
  return {
    copy_file: createCopyFileTools({ sandbox }),
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
};
