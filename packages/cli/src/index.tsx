#!/usr/bin/env node
import { configureSandboxEnv } from "@my-agent/core";
import { config as loadEnv } from "dotenv";
import { render } from "ink";
import { configureEnv } from "reactivity-store";

import { App } from "./app";
import { initArgs } from "./hooks/use-args.js";

// Load .env file from current working directory
loadEnv();

configureEnv({ allowNonBrowserUpdates: true });

// Configure sandbox environment from SANDBOX_ENV
// Options: 'local' (just-bash sandbox, default), 'native' (direct system), 'remote' (cloud)
const sandboxEnv = (process.env.SANDBOX_ENV || "local") as "local" | "native" | "remote";
configureSandboxEnv(sandboxEnv);

// Parse and initialize args (merges with env vars)
const args = process.argv.slice(2);
initArgs(args);

// Render the app
render(<App />, { incrementalRendering: false, maxFps: 30, exitOnCtrlC: false, renderProcess: true });
