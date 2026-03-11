#!/usr/bin/env node
import { render } from "ink";

import { App } from "./components/App.js";
import { initArgs } from "./hooks/useArgs.js";

// Parse and initialize args
const args = process.argv.slice(2);
initArgs(args);

// Render the app
render(<App />, { incrementalRendering: true, maxFps: 30 });
