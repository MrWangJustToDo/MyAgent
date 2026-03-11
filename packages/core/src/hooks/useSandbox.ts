import { justBash } from "@computesdk/just-bash";
import { ReadWriteFs } from "just-bash";
import { createState } from "reactivity-store";

import { useTools } from "./useTools";

// Store compute instances per root path for proper isolation
const computeInstances = new Map<string, ReturnType<typeof justBash>>();

// Get or create a just-bash compute instance for a given root path
const getCompute = (rootPath: string) => {
  let instance = computeInstances.get(rootPath);
  if (!instance) {
    // Use ReadWriteFs for actual file system access
    // The root path becomes the root of the virtual filesystem
    // So /foo/bar on disk becomes / in the virtual filesystem
    instance = justBash({
      fs: new ReadWriteFs({ root: rootPath }),
      cwd: "/", // Use "/" as cwd since rootPath is mounted at virtual "/"
    });
    computeInstances.set(rootPath, instance);
  }
  return instance;
};

export const useSandbox = createState(() => ({ state: {} }) as { state: Record<string, string> }, {
  withActions: (s) => {
    const getSandbox = async (rootPath: string) => {
      const sandboxKey = s.state[rootPath];
      const compute = getCompute(rootPath);

      if (sandboxKey) {
        const existSandbox = await compute.sandbox.getById(sandboxKey);
        if (existSandbox) {
          return existSandbox;
        }
      }

      // Create sandbox with "/" as directory since the real rootPath is mounted at virtual "/"
      const newSandbox = await compute.sandbox.create({ directory: "/" });

      s.state[rootPath] = newSandbox.sandboxId;

      return newSandbox;
    };

    const deleteSandbox = async (rootPath: string) => {
      useTools.getActions().deleteTools(rootPath);

      const sandboxKey = s.state[rootPath];

      if (!sandboxKey) return;

      const compute = getCompute(rootPath);
      const existSandbox = await compute.sandbox.getById(sandboxKey);

      if (existSandbox) {
        await existSandbox.destroy();
      }

      // Clean up the compute instance
      computeInstances.delete(rootPath);
      delete s.state[rootPath];
    };

    return {
      init: getSandbox,
      getSandbox,
      deleteSandbox,
      reset: async () => await Promise.all(Object.keys(s.state).map(deleteSandbox)),
    };
  },
});
