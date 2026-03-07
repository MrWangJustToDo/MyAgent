#!/usr/bin/env node
import { render } from "ink";

import { App } from "./components/App.js";

const args = process.argv.slice(2);
const command = args[0] || "help";

render(<App command={command} args={args.slice(1)} />);
