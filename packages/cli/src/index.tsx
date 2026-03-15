#!/usr/bin/env node
import { render } from "ink";
import { configureEnv } from "reactivity-store";

import { App } from "./app";
import { initArgs } from "./hooks/useArgs.js";

configureEnv({ allowNonBrowserUpdates: true });

// Parse and initialize args
const args = process.argv.slice(2);
initArgs(args);

// Render the app
render(<App />, { incrementalRendering: false });
