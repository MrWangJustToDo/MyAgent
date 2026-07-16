import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const pathShim = fileURLToPath(new URL("../shims/node-path.ts", import.meta.url));
const fsShim = fileURLToPath(new URL("../shims/node-fs.ts", import.meta.url));
const fsPromisesShim = fileURLToPath(new URL("../shims/node-fs-promises.ts", import.meta.url));
const cryptoShim = fileURLToPath(new URL("../shims/node-crypto.ts", import.meta.url));

const EXACT: Record<string, string> = {
  "node:path": pathShim,
  path: pathShim,
  "node:fs/promises": fsPromisesShim,
  "fs/promises": fsPromisesShim,
  "node:fs": fsShim,
  fs: fsShim,
  "node:crypto": cryptoShim,
  crypto: cryptoShim,
};

const VIRTUAL_EMPTY = "\0playground-node-empty";
const VIRTUAL_AGENT_TOOLSET = "\0playground-anthropic-agent-toolset";

/**
 * Resolve Node built-ins and unused Anthropic Node-only toolset to browser-safe stubs.
 */
export function stubNodeBuiltins(): Plugin {
  return {
    name: "stub-node-builtins",
    enforce: "pre",
    resolveId(id) {
      if (EXACT[id]) return EXACT[id];

      if (id.includes("@anthropic-ai/sdk/tools/agent-toolset") || id.includes("/tools/agent-toolset/")) {
        return VIRTUAL_AGENT_TOOLSET;
      }

      if (id.startsWith("node:")) return VIRTUAL_EMPTY;
      return null;
    },
    load(id) {
      if (id === VIRTUAL_AGENT_TOOLSET) {
        return `
export default {};
export const betaAgentToolset20260401 = () => ({});
`;
      }

      if (id === VIRTUAL_EMPTY) {
        return `
export function promisify(fn) {
  return (...args) => Promise.resolve(typeof fn === "function" ? fn(...args) : undefined);
}
export function execFile() {
  return Promise.reject(new Error("node:child_process is not available in the browser"));
}
export class Readable {}
export class Writable {}
export class Transform {}
export async function pipeline() {}
export default {
  promisify,
  execFile,
  Readable,
  Writable,
  Transform,
  pipeline,
};
`;
      }

      return null;
    },
  };
}
