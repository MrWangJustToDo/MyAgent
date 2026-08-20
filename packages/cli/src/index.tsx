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
  useConfig,
  useTodoManager,
} from "@my-agent/app";
import { createDirectModelProvider, registerCoreEnv, registerModelProvider } from "@my-agent/core";
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

// CoreEnv plane — workspace fs/shell (`--remote-env` / REMOTE_ENV)
const remoteEnv = appConfig.remoteEnv;
if (remoteEnv) {
  try {
    const { createRemoteEnv } = await import("@my-agent/server/client");
    const remoteEnvInstance = await createRemoteEnv(remoteEnv);
    registerCoreEnv(remoteEnvInstance);
    console.log(`[cli] Connected to remote CoreEnv: ${remoteEnv} (rootPath=${remoteEnvInstance.rootPath})`);
  } catch (err) {
    console.error(`[cli] Failed to connect to remote CoreEnv at ${remoteEnv}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Make sure the server is running: pnpm start:server`);
    process.exit(1);
  }
} else {
  const useOsSandbox = (process.env.SANDBOX_ENV || "local") !== "native";
  registerCoreEnv(createNodeEnv({ rootPath: process.cwd(), sandbox: useOsSandbox }));
}

// Provider plane — LLM keys (`--remote-provider` / REMOTE_PROVIDER); orthogonal to CoreEnv
const remoteProvider = appConfig.remoteProvider;
if (remoteProvider) {
  try {
    const { createRemoteProvider } = await import("@my-agent/server/client");
    registerModelProvider(await createRemoteProvider(remoteProvider));
    console.log(`[cli] Using remote model provider: ${remoteProvider}`);
  } catch (err) {
    console.error(`[cli] Failed to connect to remote model provider at ${remoteProvider}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
} else {
  registerModelProvider(
    createDirectModelProvider({
      model: appConfig.model,
      style: appConfig.style,
      baseURL: appConfig.baseURL,
      apiKey: appConfig.apiKey,
    })
  );
}

if (appConfig.remoteSession) {
  // Remote session plane is distinct from CoreEnv `--remote-env`. Full RemoteSessionClient
  // chat wiring can bind via `@my-agent/server/agent-session` when hosts opt in.
  console.log(`[cli] Remote Agent Session configured: ${appConfig.remoteSession}`);
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
  hooks: { useAgent, useAgentLog, useTodoManager },
});

/** CSI hide — re-sent after every frame so the hardware cursor stays off. */
const HIDE_NATIVE_CURSOR = "\x1b[?25l";

function hideNativeCursor(): void {
  const stdout = process.stdout;
  if (stdout.isTTY) {
    stdout.write(HIDE_NATIVE_CURSOR);
  }
}

initHighlighter()
  .then(() => {
    render(
      <AdapterProvider value={adapter}>
        <App />
      </AdapterProvider>,
      {
        incrementalRendering: true,
        maxFps: 30,
        exitOnCtrlC: false,
        renderProcess: true,
        animatedScroll: true,
        onRender: hideNativeCursor,
      }
    );
  })
  .catch((err) => {
    console.error("[cli] Failed to initialize syntax highlighter:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
