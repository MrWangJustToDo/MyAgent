import { createMCPClient } from "@tanstack/ai-mcp";

import { getEnv } from "../../env.js";

import { wrapMcpToolForMultimodalContent } from "./prefer-multimodal-content.js";

import type { McpConfig, McpServerConfig } from "./types.js";
import type { McpProcessHandle } from "../../env.js";
import type { ServerTool } from "@tanstack/ai";
import type { MCPClient, TransportInput } from "@tanstack/ai-mcp";

// ============================================================================
// McpServerStatus — public data for display in CLI /mcp command
// ============================================================================

export interface McpServerStatus {
  name: string;
  transport: string;
  toolCount: number;
  status: "connected" | "failed";
  error?: string;
  command?: string;
  args?: string[];
  url?: string;
}

export type McpToolsRecord = Record<string, ServerTool>;

// ============================================================================
// Transport Factory
// ============================================================================

function createTransportInput(config: McpServerConfig): TransportInput {
  if (config.transport === "stdio") {
    const env = getEnv();
    if (!env.createMCPStdioTransport) {
      throw new Error(
        "Stdio MCP transport is not available in this environment. " +
          "Use SSE or HTTP transport, or provide createMCPStdioTransport in CoreEnv."
      );
    }
    return env.createMCPStdioTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    }) as TransportInput;
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
  private stdioTransports: unknown[] = [];

  private serverStatuses: Map<string, McpServerStatus> = new Map();

  /**
   * Connect to all configured MCP servers and return TanStack {@link ServerTool} records.
   * Failed connections are logged but do not block other servers.
   */
  async initialize(config: McpConfig): Promise<McpToolsRecord> {
    const allTools: McpToolsRecord = {};
    const servers = config.mcpServers;

    for (const [name, serverConfig] of Object.entries(servers) as [string, McpServerConfig][]) {
      try {
        const transport = createTransportInput(serverConfig);

        if (serverConfig.transport === "stdio") {
          this.stdioTransports.push(transport);
        }

        const client = await createMCPClient({
          transport,
          name: `my-agent-mcp-${name}`,
          prefix: `mcp__${name}_`,
        });

        const tools = await client.tools();

        for (const tool of tools) {
          // TanStack prefers structuredContent and drops content[] images; re-wrap execute.
          allTools[tool.name] = wrapMcpToolForMultimodalContent(tool, client);
        }

        this.clients.set(name, client);

        this.serverStatuses.set(name, {
          name,
          transport: serverConfig.transport,
          toolCount: tools.length,
          status: "connected",
          command: serverConfig.transport === "stdio" ? serverConfig.command : undefined,
          args: serverConfig.transport === "stdio" ? serverConfig.args : undefined,
          url: serverConfig.transport !== "stdio" ? serverConfig.url : undefined,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        this.serverStatuses.set(name, {
          name,
          transport: serverConfig.transport,
          toolCount: 0,
          status: "failed",
          error: error.message,
          command: serverConfig.transport === "stdio" ? serverConfig.command : undefined,
          args: serverConfig.transport === "stdio" ? serverConfig.args : undefined,
          url: serverConfig.transport !== "stdio" ? serverConfig.url : undefined,
        });
      }
    }

    return allTools;
  }

  getServerStatuses(): McpServerStatus[] {
    return Array.from(this.serverStatuses.values());
  }

  forceKill(): void {
    const env = getEnv();
    for (const transport of this.stdioTransports) {
      try {
        let child: McpProcessHandle | undefined;
        if (env.getMCPTransportProcess) {
          child = env.getMCPTransportProcess(transport);
        }
        if (child && !child.killed) {
          child.kill("SIGKILL");
        }
        if (transport && typeof transport === "object" && "close" in transport) {
          (transport as { close(): void }).close();
        }
      } catch {
        // Ignore errors during force kill
      }
    }
    this.stdioTransports = [];
    this.clients.clear();
    this.serverStatuses.clear();
  }

  async shutdown(): Promise<void> {
    for (const [, client] of this.clients) {
      try {
        await client.close();
      } catch {
        // Ignore close errors during shutdown
      }
    }
    this.clients.clear();
    this.stdioTransports = [];
    this.serverStatuses.clear();
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }
}
