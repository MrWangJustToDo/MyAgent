#!/usr/bin/env node

import { serve } from "@hono/node-server";
import { registerCoreEnv } from "@my-agent/core";
import { createNodeEnv } from "@my-agent/node";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { networkInterfaces } from "os";

import { REMOTE_PROVIDER_API_KEY } from "./provider-constants.js";
import { agentSessionRoutes } from "./routes/agent-session.js";
import { commandRoutes } from "./routes/command.js";
import { envRoutes, filterSensitiveVars } from "./routes/env.js";
import { fetchRoutes } from "./routes/fetch.js";
import { fsRoutes } from "./routes/fs.js";
import { mcpRoutes } from "./routes/mcp.js";
import {
  anthropicProxyBasePath,
  mapProviderPathToUpstream,
  normalizeProviderRequestPath,
  openaiProxyBasePath,
  providerRoutes,
  readServerModelEnv,
} from "./routes/provider.js";

export {
  REMOTE_PROVIDER_API_KEY,
  anthropicProxyBasePath,
  filterSensitiveVars,
  mapProviderPathToUpstream,
  normalizeProviderRequestPath,
  openaiProxyBasePath,
  providerRoutes,
  readServerModelEnv,
};

export { createProxyModelProvider } from "./remote-provider.js";

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.SERVER_PORT || "3100", 10);
const ROOT_PATH = process.env.ROOT_PATH || process.cwd();
const SANDBOX_ENV = process.env.SANDBOX_ENV || "local";

registerCoreEnv(createNodeEnv({ rootPath: ROOT_PATH, mode: SANDBOX_ENV === "native" ? "native" : "os" }));

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

// ============================================================================
// RPC Routes (chained for AppType inference)
// ============================================================================

const api = new Hono()
  .route("/env", envRoutes)
  .route("/fs", fsRoutes)
  .route("/command", commandRoutes)
  .route("/fetch", fetchRoutes)
  .route("/mcp", mcpRoutes)
  .route("/provider", providerRoutes)
  // Agent plane (AgentSession) — separate from CoreEnv workspace routes above
  .route("/agent", agentSessionRoutes);

export type AppType = typeof api;

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
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept", "Authorization", "x-api-key", "anthropic-version", "anthropic-beta"],
  })
);

app.get("/health", (c) => {
  return c.json({ status: "ok", rootPath: ROOT_PATH, sandboxEnv: SANDBOX_ENV });
});

app.route("/api", api);

export { app, api };

export const createServer = () => {
  return serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[server] CoreEnv HTTP server listening on http://localhost:${info.port}`);
    console.log(`[server] CoreEnv HTTP server listening on http://${getLocalIP()}:${info.port}`);
    console.log(`[server] rootPath=${ROOT_PATH}, sandbox=${SANDBOX_ENV}`);
  });
};
