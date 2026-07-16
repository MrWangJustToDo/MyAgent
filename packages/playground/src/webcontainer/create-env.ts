import { WebContainer } from "@webcontainer/api";

import { createWebContainerFs } from "./create-fs.js";
import { createProxiedFetch, resolveFetchProxyUrl, setFetchProxyUrl } from "./create-proxy-fetch.js";
import { mimeFromPath } from "./mime.js";
import { execWebContainerCommand, runWebContainerCommand } from "./run-command.js";

import type { CoreEnv } from "@my-agent/core";
import type { FileSystemTree } from "@webcontainer/api";

const ROOT_PATH = "/";

let bootPromise: Promise<CoreEnv> | null = null;
let bootedWebContainer: WebContainer | null = null;

/** Live WebContainer instance after boot (null until {@link createWebContainerEnv} finishes). */
export function getBootedWebContainer(): WebContainer | null {
  return bootedWebContainer;
}

/**
 * Loaded as project instructions (`AGENTS.md`) on agent bootstrap.
 * Keep focused: environment facts the model cannot infer from tools alone.
 */
const AGENTS_MD = `# Playground workspace (WebContainer)

You are running inside **My Agent Playground**: a browser-hosted Linux-like workspace
backed by [WebContainers](https://webcontainers.io/). The UI is the shared agent app;
this filesystem and shell are the only project the tools can see.

## Environment

| Fact | Value |
|------|--------|
| Root / cwd | \`/\` — file tools and \`run_command\` share this project workdir |
| Platform | Linux x64 (emulated in-browser) |
| Home | \`/home\` (user home; **not** the project root — do not \`cd /home\` for app files) |
| Shell | \`jsh\` via \`run_command\` / \`exec\` (starts in the project workdir, same as file tools) |
| Node / npm | Available (WebContainer Node runtime) |
| Persistence | In-tab only — refresh or closing the tab resets the workspace unless the host remounts files |

There is **no** separate remote CoreEnv server and **no** OS sandbox toggle: isolation is the browser + WebContainer.

**Workspace vs \`/home\`:** WebContainer also has a Linux-like tree (\`/bin\`, \`/home\`, …). Agent file tools and shell cwd use the **mounted project workdir** (exposed as \`/\` to tools). Listing Linux \`/home\` without entering the project folder will not show files you just wrote.

## What works well

- Edit files with \`read_file\` / \`write_file\` / \`edit_file\`; explore with \`tree\` / \`glob\` / \`grep\`.
- Install and run Node projects: \`npm install\`, \`npm run …\`, \`node …\`.
- Use \`run_command\` for shell work (build, test, scripts). Prefer npm scripts over ad-hoc global tools that are not installed.

## Network and web tools

- Outbound HTTP from inside the container is still **CORS-limited** by the browser.
- Prefer the agent **\`webfetch\` / \`websearch\`** tools (host routes them through a server-side fetch proxy).
- Do **not** rely on \`curl\` / \`wget\` / Node \`fetch\` inside the container to reach arbitrary URLs — they often fail with CORS even when the proxy works for webfetch.
- If webfetch fails with a proxy/CORS error, tell the user to configure **Settings → Fetch proxy URL** (or use local \`pnpm dev:playground\`, which provides \`/__fetch_proxy\`).

## Limitations

- **MCP stdio** is not available in this browser CoreEnv.
- No real GPU, Docker, or native host filesystem access outside this WebContainer tree.
- Binary / system packages beyond what WebContainer ships may be missing; stick to npm when possible.
- Do not assume the host machine's files, SSH keys, or local \`~/.config\` exist here.

## Guidance

- Treat \`/\` as the project root; keep new work under clear paths (e.g. \`src/\`, \`package.json\`).
- After changing dependencies or entrypoints, verify with a command before declaring done.
- Be explicit when a failure is environment-related (CORS, missing binary, ephemeral FS) vs. a code bug.

## Preview (host UI)

- When a process **listens on a port**, the playground host opens a **Preview** side panel (iframe) automatically.
- Bind to \`0.0.0.0\` (or the runtime default) so WebContainer can publish a preview URL — avoid host-only quirks.
- Long-running servers (e.g. \`npm run dev\`) may keep \`run_command\` busy until the user aborts; that is expected. Preview still works while the server runs.
`;

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
        "# WebContainer Playground\n\nThis workspace runs inside the browser via WebContainers.\n" +
        "Use the agent to edit files, run npm, and explore with shell commands.\n\n" +
        "See `AGENTS.md` for environment constraints the coding agent should follow.\n",
    },
  },
  "AGENTS.md": {
    file: {
      contents: AGENTS_MD,
    },
  },
};

export interface CreateWebContainerEnvOptions {
  /** Initial filesystem tree mounted after boot. Defaults to a tiny sample workspace. */
  files?: FileSystemTree;
  /**
   * Server-side fetch proxy URL for webfetch/websearch.
   * WebContainer cannot bypass CORS; use Vite `/__fetch_proxy` (dev) or Cloudflare Worker (Pages).
   */
  fetchProxyUrl?: string;
}

/**
 * Return the singleton WebContainer-backed CoreEnv.
 *
 * WebContainer allows only one boot per page — reuse across agent restarts and
 * config updates instead of calling {@link createWebContainerEnv} again.
 */
export function getWebContainerEnv(options: CreateWebContainerEnvOptions = {}): Promise<CoreEnv> {
  setFetchProxyUrl(resolveFetchProxyUrl(options.fetchProxyUrl));
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

  setFetchProxyUrl(resolveFetchProxyUrl(options.fetchProxyUrl));

  const wc = await WebContainer.boot({
    coep: "require-corp",
    // Stable project folder name under /home (cosmetic); fs + shell both use this workdir.
    workdirName: "workspace",
  });
  bootedWebContainer = wc;

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
    // Must be a real server proxy — WebContainer outbound is still CORS-limited.
    fetch: createProxiedFetch(),
    getMimeType: async (filePath) => mimeFromPath(filePath),
    destroy: async () => {
      // WebContainer API does not expose a stable teardown; drop references.
    },
  };

  return env;
}
