#!/usr/bin/env node

import { createApp } from "@cyanheads/mcp-ts-core";

import { screenshotTool } from "./tools/screenshot.js";

await createApp({
  name: "codent-mcp-server",
  version: "0.0.1",
  tools: [screenshotTool],
});
