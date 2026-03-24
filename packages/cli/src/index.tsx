#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { render } from "ink";
import { configureEnv } from "reactivity-store";

import { App } from "./app";
import { initArgs } from "./hooks/use-args.js";

// Load .env file from current working directory
loadEnv();

configureEnv({ allowNonBrowserUpdates: true });

// Parse and initialize args (merges with env vars)
const args = process.argv.slice(2);
initArgs(args);

// Render the app
render(<App />, { incrementalRendering: false, maxFps: 30 });
