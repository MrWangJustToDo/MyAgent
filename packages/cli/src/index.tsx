#!/usr/bin/env node
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
import { readClipboardImage } from "./clipboard.js";
import { LocalAgentAdapter } from "./local-adapter.js";
import { TerminalTitle } from "./terminal-title.js";

loadEnv();

const appConfig = parseCliArgs(process.argv.slice(2));

if (isHelpRequested(process.argv.slice(2))) {
  useConfig.getActions().setHelpRequested(true);
}

// Boundary guard — the three remote planes are orthogonal on the client EXCEPT
// `--remote-session`, which runs the whole agent loop server-side and therefore
// cannot be combined with `--remote-env` / `--remote-provider` on the same
// client. Local LLM settings travel to the server via `--model`; the server
// itself may still register its own REMOTE_ENV / REMOTE_PROVIDER.
if (appConfig.remoteSession && (appConfig.remoteEnv || appConfig.remoteProvider)) {
  const conflicts = [appConfig.remoteEnv ? "--remote-env" : "", appConfig.remoteProvider ? "--remote-provider" : ""]
    .filter(Boolean)
    .join(" / ");
  console.error(
    `[cli] --remote-session cannot be combined with ${conflicts}: the agent loop runs server-side, so this client cannot also proxy its workspace or LLM keys.`
  );
  console.error(`  Use --model <id> to push local LLM settings to the server, or configure`);
  console.error(`  REMOTE_ENV / REMOTE_PROVIDER on the remote server itself.`);
  process.exit(1);
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
} else if (appConfig.remoteSession) {
  // Remote session: the agent runs on the server's CoreEnv, so the workspace
  // panel (file tree / preview / diff / git) must show the server's filesystem
  // too, not the CLI's local one. Reuse the same remote CoreEnv client as
  // `--remote-env`; a explicit `--remote-env` above still takes precedence.
  try {
    const { createRemoteEnv } = await import("@my-agent/server/client");
    const remoteEnvInstance = await createRemoteEnv(appConfig.remoteSession);
    registerCoreEnv(remoteEnvInstance);
    console.log(
      `[cli] Remote session: workspace CoreEnv from server ${appConfig.remoteSession} (rootPath=${remoteEnvInstance.rootPath})`
    );
  } catch (err) {
    console.error(`[cli] Failed to connect to remote CoreEnv at ${appConfig.remoteSession}`);
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

// Remote session + no explicit `--model*` flag + no `--remote-provider`: defer
// model resolution to the server's own `.env` provider instead of shipping local
// defaults across the wire. Pass an explicit `--model` (or `--remote-provider`)
// to keep model control client-side.
if (appConfig.remoteSession && !remoteProvider && !appConfig.modelExplicit) {
  appConfig.model = "";
  appConfig.style = undefined;
  appConfig.baseURL = undefined;
  appConfig.apiKey = undefined;
  appConfig.modelInfo = undefined;
  console.log("[cli] Remote session: no explicit --model, deferring model to the server provider.");
}

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
        <TerminalTitle />
        <App />
      </AdapterProvider>,
      {
        incrementalRendering: true,
        maxFps: 30,
        exitOnCtrlC: false,
        renderProcess: true,
        onRender: hideNativeCursor,
        standardReactLayoutTiming: true,
      }
    );
  })
  .catch((err) => {
    console.error("[cli] Failed to initialize syntax highlighter:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
