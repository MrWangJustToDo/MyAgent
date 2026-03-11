import { createState } from "reactivity-store";

import { createTools, type Tools } from "../agent/tools";

import { useSandbox } from "./useSandbox";

export const useTools = createState(() => ({ toolsMap: {} as Record<string, Tools> }), {
  withActions: (s) => {
    const getTools = async (key: string) => {
      if (s.toolsMap[key]) {
        return s.toolsMap[key];
      }

      const sandbox = await useSandbox.getActions().getSandbox(key);

      const tools = createTools({ sandbox });

      s.toolsMap[key] = tools;

      return tools;
    };
    const deleteTools = async (key: string) => {
      delete s.toolsMap[key];
    };

    return {
      init: getTools,
      getTools,
      deleteTools,
      clear: () => {
        s.toolsMap = {};
      },
    };
  },
});
