import { getEnv } from "../../env.js";

import { mcpConfigSchema } from "./types.js";

import type { McpConfig } from "./types.js";
import type { CoreEnvFs } from "../../env.js";
import type { AgentLog } from "../agent-log/agent-log.js";

export interface McpConfigLoadResult {
  config: McpConfig;
  sourcePath: string;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_MCP_CONFIG_PATH = ".opencode/mcp.json";

/**
 * Additional default MCP config file paths (checked in order if no explicit path given).
 * `.mcp.json` is the community-standard MCP config file name used by many tools.
 */
const FALLBACK_MCP_CONFIG_PATHS = [".mcp.json"];

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load MCP configuration from a JSON file on disk.
 *
 * When `configPath` is explicitly provided, only that single path is checked.
 * When `configPath` is omitted, the primary default (`.opencode/mcp.json`) is
 * checked first, then fallback paths (`.mcp.json`) are tried in order.
 *
 * Returns null if no config file is found or all are invalid (MCP disabled).
 */
export async function loadMcpConfig(log: AgentLog, configPath?: string): Promise<McpConfigLoadResult | null> {
  const fs = getEnv().fs;

  // If an explicit path is given, only check that one
  if (configPath) {
    return loadSingleConfig(log, fs, configPath);
  }

  // Otherwise, try the primary default first, then fallbacks
  const paths = [DEFAULT_MCP_CONFIG_PATH, ...FALLBACK_MCP_CONFIG_PATHS];
  for (const path of paths) {
    try {
      const exists = await fs.exists(path);
      if (!exists) continue;

      const content = await fs.readFile(path);
      const parsed = JSON.parse(content);
      const result = mcpConfigSchema.parse(parsed);
      return { config: result, sourcePath: path };
    } catch (e) {
      log.error("agent", `Load mcp config failed: ${path}`, e as Error);
      // Continue to next fallback
    }
  }

  return null;
}

/**
 * Try loading MCP config from a single path.
 */
async function loadSingleConfig(log: AgentLog, fs: CoreEnvFs, path: string): Promise<McpConfigLoadResult | null> {
  try {
    const exists = await fs.exists(path);
    if (!exists) {
      log.warn("agent", `MCP config file not found: ${path}`);
      return null;
    }

    const content = await fs.readFile(path);
    const parsed = JSON.parse(content);
    return { config: mcpConfigSchema.parse(parsed), sourcePath: path };
  } catch (e) {
    log.error("agent", `Load mcp config failed: ${path}`, e as Error);
    return null;
  }
}
