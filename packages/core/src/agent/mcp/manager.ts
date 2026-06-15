import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

import type { McpConfig, McpServerConfig } from "./types.js";
import type { AgentLog } from "../agent-log";
import type { MCPClient, MCPClientConfig } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import type { ChildProcess } from "child_process";

// ============================================================================
// McpServerStatus — public data for display in CLI /mcp command
// ============================================================================

export interface McpServerStatus {
  /** Server name from config key */
  name: string;
  /** Transport type */
  transport: string;
  /** Number of tools registered from this server */
  toolCount: number;
  /** Whether the connection succeeded or failed */
  status: "connected" | "failed";
  /** Error message if connection failed */
  error?: string;
  /** Stdio command (for stdio transport) */
  command?: string;
  /** Stdio command args (for stdio transport) */
  args?: string[];
  /** SSE/HTTP URL (for sse/http transport) */
  url?: string;
  /** MCP server name reported during handshake */
  serverName?: string;
  /** MCP server version reported during handshake */
  serverVersion?: string;
}

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

/**
 * Extract the child process from a stdio transport instance.
 * The transport stores it as a public `process` property internally.
 */
function getTransportProcess(transport: Experimental_StdioMCPTransport): ChildProcess | undefined {
  return (transport as unknown as { process?: ChildProcess }).process;
}

// ============================================================================
// McpManager
// ============================================================================

export class McpManager {
  private clients: Map<string, MCPClient> = new Map();
  private stdioTransports: Experimental_StdioMCPTransport[] = [];

  /** Per-server status metadata for display (populated during initialize) */
  private serverStatuses: Map<string, McpServerStatus> = new Map();

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

        // Track stdio transports for synchronous force-kill on exit
        if (transport instanceof Experimental_StdioMCPTransport) {
          this.stdioTransports.push(transport);
        }

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

        // Record status for display
        this.serverStatuses.set(name, {
          name,
          transport: serverConfig.transport,
          toolCount: Object.keys(tools).length,
          status: "connected",
          command: serverConfig.transport === "stdio" ? serverConfig.command : undefined,
          args: serverConfig.transport === "stdio" ? serverConfig.args : undefined,
          url: serverConfig.transport !== "stdio" ? serverConfig.url : undefined,
          serverName: client.serverInfo?.name,
          serverVersion: client.serverInfo?.version,
        });

        logger?.info("agent", `MCP server connected: ${name}`, {
          toolCount: Object.keys(tools).length,
          transport: serverConfig.transport,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Record failure status
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

        logger?.error("agent", `MCP server failed: ${name}`, error, {
          transport: serverConfig.transport,
        });
      }
    }

    return allTools;
  }

  /**
   * Get detailed status for all configured MCP servers.
   */
  getServerStatuses(): McpServerStatus[] {
    return Array.from(this.serverStatuses.values());
  }

  /**
   * Synchronously force-kill all MCP child processes.
   * Directly sends SIGKILL to each stdio child process to guarantee termination.
   */
  forceKill(): void {
    for (const transport of this.stdioTransports) {
      try {
        // Directly kill the child process with SIGKILL (cannot be caught/ignored)
        const child = getTransportProcess(transport);
        if (child && !child.killed) {
          child.kill("SIGKILL");
        }
        transport.close();
      } catch {
        // Ignore errors during force kill
      }
    }
    this.stdioTransports = [];
    this.clients.clear();
    this.serverStatuses.clear();
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
    this.stdioTransports = [];
    this.serverStatuses.clear();
  }

  /**
   * Get the names of all connected MCP servers.
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }
}
