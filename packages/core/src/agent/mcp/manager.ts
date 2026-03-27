import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

import type { McpConfig, McpServerConfig } from "./types.js";
import type { AgentLog } from "../agent-log";
import type { MCPClient, MCPClientConfig } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

// ============================================================================
// Transport Factory
// ============================================================================

function createTransport(config: McpServerConfig): MCPClientConfig["transport"] {
  if (config.transport === "stdio") {
    return new Experimental_StdioMCPTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }
  return {
    type: config.transport,
    url: config.url,
    headers: config.headers,
  };
}

// ============================================================================
// McpManager
// ============================================================================

export class McpManager {
  private clients: Map<string, MCPClient> = new Map();

  /**
   * Connect to all configured MCP servers and return their tools as a merged ToolSet.
   * Failed connections are logged but do not block other servers.
   */
  async initialize(config: McpConfig, logger?: AgentLog | null): Promise<ToolSet> {
    const allTools: ToolSet = {};
    const servers = config.mcpServers;

    for (const [name, serverConfig] of Object.entries(servers) as [string, McpServerConfig][]) {
      try {
        const transport = createTransport(serverConfig);

        const client = await createMCPClient({
          transport,
          name: `my-agent-mcp-${name}`,
        });

        const tools = await client.tools();

        // Prefix tool names to avoid collisions with built-in tools and between servers
        for (const [toolName, toolDef] of Object.entries(tools)) {
          const prefixed = `mcp__${name}__${toolName}`;
          allTools[prefixed] = toolDef as ToolSet[string];
        }

        this.clients.set(name, client);
        logger?.info("agent", `MCP server connected: ${name}`, {
          toolCount: Object.keys(tools).length,
          transport: serverConfig.transport,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger?.error("agent", `MCP server failed: ${name}`, error, {
          transport: serverConfig.transport,
        });
      }
    }

    return allTools;
  }

  /**
   * Disconnect all MCP server connections.
   */
  async shutdown(): Promise<void> {
    for (const [, client] of this.clients) {
      try {
        await client.close();
      } catch {
        // Ignore close errors during shutdown
      }
    }
    this.clients.clear();
  }

  /**
   * Get the names of all connected MCP servers.
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }
}
