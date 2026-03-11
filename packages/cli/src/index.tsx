#!/usr/bin/env node
import { render } from "ink";

import { App } from "./components/App.js";
import { parseArgs, getFlag } from "./hooks/useArgs.js";

const args = process.argv.slice(2);
const parsed = parseArgs(args);

// Check if help is requested
const showHelp = getFlag(parsed, "h", "help") === true;

// Pass all args to App, let it handle the logic
render(<App args={args} showHelp={showHelp} parsed={parsed} />, { incrementalRendering: true, maxFps: 30 });
