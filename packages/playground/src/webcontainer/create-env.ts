import { WebContainer } from "@webcontainer/api";

import { FETCH_RUNNER_SOURCE, createWebContainerFetch } from "./create-fetch.js";
import { createWebContainerFs } from "./create-fs.js";
import { mimeFromPath } from "./mime.js";
import { execWebContainerCommand, runWebContainerCommand } from "./run-command.js";

import type { CoreEnv } from "@my-agent/core";
import type { FileSystemTree } from "@webcontainer/api";

const ROOT_PATH = "/";

let bootPromise: Promise<CoreEnv> | null = null;

const INITIAL_FILES: FileSystemTree = {
  "package.json": {
    file: {
      contents: JSON.stringify(
        {
          name: "playground-workspace",
          private: true,
          type: "module",
        },
        null,
        2
      ),
    },
  },
  "README.md": {
    file: {
      contents:
        "# WebContainer Playground\n\nThis workspace runs inside the browser via WebContainers.\nUse the agent to edit files, run npm, and explore with shell commands.\n",
    },
  },
  src: {
    directory: {
      "hello.ts": {
        file: {
          contents: 'console.log("Hello from WebContainer");\n',
        },
      },
    },
  },
  ".playground": {
    directory: {
      "fetch.mjs": {
        file: {
          contents: FETCH_RUNNER_SOURCE,
        },
      },
    },
  },
};

export interface CreateWebContainerEnvOptions {
  /** Initial filesystem tree mounted after boot. Defaults to a tiny sample workspace. */
  files?: FileSystemTree;
}

/**
 * Return the singleton WebContainer-backed CoreEnv.
 *
 * WebContainer allows only one boot per page — reuse across agent restarts and
 * config updates instead of calling {@link createWebContainerEnv} again.
 */
export function getWebContainerEnv(options: CreateWebContainerEnvOptions = {}): Promise<CoreEnv> {
  if (!bootPromise) {
    bootPromise = createWebContainerEnv(options);
  }
  return bootPromise;
}

/**
 * Boot a WebContainer and expose it as a {@link CoreEnv}.
 *
 * Requires cross-origin isolation (`SharedArrayBuffer`) — Vite sets COOP/COEP in
 * dev/preview; static hosts need `coi-serviceworker.js` (see package README).
 */
export async function createWebContainerEnv(options: CreateWebContainerEnvOptions = {}): Promise<CoreEnv> {
  if (typeof SharedArrayBuffer === "undefined" || !crossOriginIsolated) {
    throw new Error(
      "WebContainers require cross-origin isolation (SharedArrayBuffer). " +
        "Use `pnpm dev:playground` (COOP/COEP headers) or open over HTTPS with coi-serviceworker.js."
    );
  }

  const wc = await WebContainer.boot({
    coep: "require-corp",
  });

  await wc.mount(options.files ?? INITIAL_FILES);

  const fs = createWebContainerFs(wc, ROOT_PATH);

  const env: CoreEnv = {
    rootPath: ROOT_PATH,
    getPlatform: async () => "linux",
    getArch: async () => "x64",
    getEnv: async () => ({
      HOME: "/home",
      PWD: ROOT_PATH,
      PATH: "/usr/local/bin:/usr/bin:/bin",
      TERM: "xterm-256color",
    }),
    homedir: async () => "/home",
    fs,
    runCommand: (command, cmdOptions) => runWebContainerCommand(wc, ROOT_PATH, command, cmdOptions),
    exec: (command, execOptions) => execWebContainerCommand(wc, ROOT_PATH, command, execOptions),
    fetch: createWebContainerFetch(wc),
    getMimeType: async (filePath) => mimeFromPath(filePath),
    destroy: async () => {
      // WebContainer API does not expose a stable teardown; drop references.
    },
  };

  return env;
}
