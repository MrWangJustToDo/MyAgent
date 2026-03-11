import { createState } from "reactivity-store";

import {
  defaultEnvironment,
  getEnvironment,
  type Environment,
  type EnvironmentType,
  type Sandbox,
} from "../environment";

import { useTools } from "./useTools";

// Store state outside to maintain proper typing
let currentEnvironment: Environment = defaultEnvironment;
const sandboxes: Record<string, Sandbox> = {};
const sandboxIds: Record<string, string> = {};

export const useSandbox = createState(
  () =>
    ({
      // Use a simple state object for reactivity-store
      state: {} as Record<string, string>,
    }) as { state: Record<string, string> },
  {
    withActions: (s) => {
      /**
       * Set the environment for all future sandbox operations
       */
      const setEnvironment = (env: EnvironmentType) => {
        currentEnvironment = getEnvironment(env);
      };

      /**
       * Get the current environment
       */
      const getEnv = (): Environment => {
        return currentEnvironment;
      };

      /**
       * Get or create a sandbox for the given root path
       */
      const getSandbox = async (rootPath: string): Promise<Sandbox> => {
        // Check if we already have a sandbox for this path
        const existingSandbox = sandboxes[rootPath];
        if (existingSandbox) {
          return existingSandbox;
        }

        // Check if we have a sandboxId and try to retrieve it
        const sandboxId = sandboxIds[rootPath];
        if (sandboxId && currentEnvironment.getSandboxById) {
          const sandbox = await currentEnvironment.getSandboxById(sandboxId);
          if (sandbox) {
            sandboxes[rootPath] = sandbox;
            s.state[rootPath] = sandbox.sandboxId;
            return sandbox;
          }
        }

        // Create a new sandbox
        const newSandbox = await currentEnvironment.createSandbox({
          rootPath,
          cwd: "/",
        });

        sandboxes[rootPath] = newSandbox;
        sandboxIds[rootPath] = newSandbox.sandboxId;
        s.state[rootPath] = newSandbox.sandboxId;

        return newSandbox;
      };

      /**
       * Delete a sandbox for the given root path
       */
      const deleteSandbox = async (rootPath: string) => {
        // Clean up tools first
        useTools.getActions().deleteTools(rootPath);

        const sandbox = sandboxes[rootPath];
        if (sandbox) {
          await sandbox.destroy();
        }

        delete sandboxes[rootPath];
        delete sandboxIds[rootPath];
        delete s.state[rootPath];
      };

      /**
       * Reset all sandboxes
       */
      const reset = async () => {
        await Promise.all(Object.keys(sandboxes).map(deleteSandbox));
      };

      return {
        setEnvironment,
        getEnvironment: getEnv,
        init: getSandbox,
        getSandbox,
        deleteSandbox,
        reset,
      };
    },
  }
);
