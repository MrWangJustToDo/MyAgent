import { mcpConfigSchema } from "./types.js";

import type { McpConfig } from "./types.js";
import type { Sandbox } from "../../environment";
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
export async function loadMcpConfig(sandbox: Sandbox, log: AgentLog, configPath?: string): Promise<McpConfig | null> {
  const path = configPath ?? DEFAULT_MCP_CONFIG_PATH;

  log.agent(`Load mcp config from path ${path}`);

  try {
    const exists = await sandbox.filesystem.exists(path);
    if (!exists) return null;

    const content = await sandbox.filesystem.readFile(path);
    const parsed = JSON.parse(content);
    return mcpConfigSchema.parse(parsed);
  } catch (e) {
    log.error("agent", `Load mcp config failed`, e as Error);

    return null;
  }
}
