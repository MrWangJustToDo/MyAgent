#!/usr/bin/env node

import { serve } from "@hono/node-server";
import { createAgentUIStreamResponse } from "ai";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { createServerAgent } from "./agent.js";

import type { Agent } from "@my-agent/core";

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.SERVER_PORT || "3100", 10);
const MODEL = process.env.MODEL || "qwen3:8b";
const PROVIDER = (process.env.PROVIDER || "ollama") as "ollama" | "openRouter" | "openaiCompatible" | "deepseek";
const API_URL = process.env.API_URL || "http://localhost:11434";
const API_KEY = process.env.API_KEY || "";
const ROOT_PATH = process.env.ROOT_PATH || process.cwd();
const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || "50", 10);
const MCP_CONFIG_PATH = process.env.MCP_CONFIG_PATH || "";

// ============================================================================
// App Setup
// ============================================================================

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (origin.startsWith("chrome-extension://")) return origin;
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) return origin;
      return "";
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["X-Request-Id"],
  })
);

// ============================================================================
// Agent Lifecycle
// ============================================================================

let agent: Agent | null = null;
let initError: Error | null = null;
let currentAbortController: AbortController | null = null;

async function initAgent() {
  try {
    console.log(`[server] Initializing agent: model=${MODEL}, provider=${PROVIDER}, rootPath=${ROOT_PATH}`);
    agent = await createServerAgent({
      model: MODEL,
      provider: PROVIDER,
      url: API_URL,
      apiKey: API_KEY,
      rootPath: ROOT_PATH,
      maxIterations: MAX_ITERATIONS,
      mcpConfigPath: MCP_CONFIG_PATH || undefined,
    });
    console.log("[server] Agent initialized successfully");
  } catch (err) {
    initError = err instanceof Error ? err : new Error(String(err));
    console.error("[server] Agent initialization failed:", initError.message);
  }
}

// ============================================================================
// Routes
// ============================================================================

app.get("/api/health", (c) => {
  if (agent) {
    return c.json({ status: "ready", model: MODEL, provider: PROVIDER });
  }
  if (initError) {
    return c.json({ status: "error", error: initError.message }, 503);
  }
  return c.json({ status: "initializing" });
});

app.post("/api/chat", async (c) => {
  if (!agent) {
    return c.json({ error: "Agent not ready" }, 503);
  }

  const body = await c.req.json();
  const { messages } = body;

  currentAbortController = new AbortController();

  const onDisconnect = () => {
    currentAbortController?.abort();
  };
  c.req.raw.signal.addEventListener("abort", onDisconnect);

  try {
    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      abortSignal: currentAbortController.signal,
      onFinish: () => {
        currentAbortController = null;
      },
    });
  } catch (err) {
    currentAbortController = null;
    const error = err instanceof Error ? err : new Error(String(err));
    return c.json({ error: error.message }, 500);
  }
});

app.get("/api/usage", (c) => {
  if (!agent) {
    return c.json({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  }
  const context = agent.getContext();
  if (!context) {
    return c.json({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  }
  const usage = context.getTotalUsage();
  const percent = context.getTokenLimitPercent();
  return c.json({ ...usage, percent });
});

app.post("/api/chat/stop", (c) => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    return c.json({ stopped: true });
  }
  return c.json({ stopped: false });
});

// ============================================================================
// Start
// ============================================================================

await initAgent();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] Listening on http://localhost:${info.port}`);
});
