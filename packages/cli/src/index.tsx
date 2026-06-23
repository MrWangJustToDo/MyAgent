#!/usr/bin/env node
import { getImageBase64, hasImage } from "@crosscopy/clipboard";
import {
  AdapterProvider,
  App,
  initConfig,
  initHighlighter,
  configureEnv,
  useAgent,
  useAgentLog,
  useAgentContext,
  useConfig,
  useTodoManager,
} from "@my-agent/app";
import { registerCoreEnv } from "@my-agent/core";
import { createNodeEnv } from "@my-agent/node";
import { config as loadEnv } from "dotenv";
import { render } from "ink";

import { isHelpRequested, parseCliArgs } from "./args.js";
import { LocalAgentAdapter } from "./local-adapter.js";

import type { ClipboardImageResult } from "@my-agent/app";

loadEnv();

const appConfig = parseCliArgs(process.argv.slice(2));

if (isHelpRequested(process.argv.slice(2))) {
  useConfig.getActions().setHelpRequested(true);
}

// Switch between local and remote CoreEnv based on --remote flag / REMOTE env
const remote = appConfig.remote;
if (remote) {
  try {
    const { createRemoteCoreEnv } = await import("@my-agent/server/client");
    const remoteEnv = await createRemoteCoreEnv(remote);
    registerCoreEnv(remoteEnv);
    console.log(`[cli] Connected to remote CoreEnv: ${remote} (rootPath=${remoteEnv.rootPath})`);
  } catch (err) {
    console.error(`[cli] Failed to connect to remote CoreEnv at ${remote}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Make sure the server is running: pnpm start:server`);
    process.exit(1);
  }
} else {
  const useOsSandbox = (process.env.SANDBOX_ENV || "local") !== "native";
  registerCoreEnv(createNodeEnv({ rootPath: process.cwd(), sandbox: useOsSandbox }));
}

configureEnv({ allowNonBrowserUpdates: true });

await initConfig(appConfig);

async function readClipboardImage(): Promise<ClipboardImageResult | null> {
  try {
    if (!hasImage()) return null;
    const rawBase64 = await getImageBase64();
    if (!rawBase64) return null;
    const stripped = rawBase64.replace(/[\s\r\n]+/g, "");
    if (!stripped) return null;
    const padLen = (4 - (stripped.length % 4)) % 4;
    const base64 = padLen > 0 ? stripped + "=".repeat(padLen) : stripped;
    const size = Math.ceil((base64.length * 3) / 4);
    if (size > 10 * 1024 * 1024) return null;
    return { data: base64, mediaType: "image/png" };
  } catch {
    return null;
  }
}

const adapter = new LocalAgentAdapter({
  exit: () => {
    setTimeout(() => process.exit(0), 200);
  },
  readClipboardImage,
  hooks: { useAgent, useAgentLog, useAgentContext, useTodoManager },
});

initHighlighter()
  .then(() => {
    render(
      <AdapterProvider value={adapter}>
        <App />
      </AdapterProvider>,
      { incrementalRendering: true, maxFps: 30, exitOnCtrlC: false, renderProcess: true }
    );
  })
  .catch((err) => {
    console.error("[cli] Failed to initialize syntax highlighter:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
