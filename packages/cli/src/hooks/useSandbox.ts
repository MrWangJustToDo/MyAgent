import { localEnvironment, sandboxManager, type Sandbox } from "@my-agent/core";
import { createState } from "reactivity-store";

export const useSandbox = createState(
  () => ({ state: null as Sandbox | null, loading: false, error: null as null | Error }),
  {
    withActions: (state) => {
      const initSandbox = async (rootPath: string) => {
        state.loading = true;

        try {
          sandboxManager.setEnvironment(localEnvironment);

          const sandbox = await sandboxManager.getSandbox(rootPath);

          state.state = sandbox;
        } catch (e) {
          state.error = e as Error;
        }

        state.loading = false;
      };

      return {
        getSandbox: async (rootPath: string) => {
          if (state.state) return state.state;

          await initSandbox(rootPath);

          return state.state;
        },
      };
    },
  }
);
