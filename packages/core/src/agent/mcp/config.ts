import { getEnv } from "../../env.js";

import { mcpConfigSchema } from "./types.js";

import type { McpConfig } from "./types.js";
import type { AgentLog } from "../agent-log/agent-log.js";

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_MCP_CONFIG_PATH = ".opencode/mcp.json";

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load MCP configuration from a JSON file on disk.
 * Returns null if the file does not exist or is invalid (MCP disabled).
 */
export async function loadMcpConfig(log: AgentLog, configPath?: string): Promise<McpConfig | null> {
  const path = configPath ?? DEFAULT_MCP_CONFIG_PATH;

  try {
    const fs = getEnv().fs;
    const exists = await fs.exists(path);
    if (!exists) return null;

    const content = await fs.readFile(path);
    const parsed = JSON.parse(content);
    return mcpConfigSchema.parse(parsed);
  } catch (e) {
    log.error("agent", `Load mcp config failed`, e as Error);

    return null;
  }
}
