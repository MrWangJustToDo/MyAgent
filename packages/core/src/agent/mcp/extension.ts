import { loadMcpConfig } from "./config.js";

import type { McpManager, McpServerStatus } from "./manager.js";
import type { ExtensionAPI, ExtensionContext } from "../extension/types.js";

// ============================================================================
// MCP extension options
// ============================================================================

export interface CreateMcpExtensionOptions {
  /** Pre-initialized MCP manager (created by the agent factory as the data layer). */
  mcpManager: McpManager;
  /** Explicit config path; when omitted, defaults (.agents/mcp.json, .mcp.json) are probed. */
  configPath?: string;
}

export interface McpExtensionConfig {
  configPath?: string;
}

// ============================================================================
// Built-in MCP extension
// ============================================================================

/**
 * Register MCP servers as an extension: connects on activate, exposes each MCP
 * tool through the extension tool registry (keeping the `mcp__<server>_` prefix
 * produced by {@link McpManager}), and provides the `/mcp` status command.
 * Deactivation shuts down all connected clients.
 */
export function createMcpExtension(options: CreateMcpExtensionOptions): ExtensionAPI {
  const { mcpManager, configPath } = options;
  return {
    id: "my-agent-mcp",
    name: "MCP",
    version: "1.0.0",
    description:
      "Model Context Protocol: connect external MCP servers over stdio/SSE/HTTP and expose their tools (mcp__<server>_<tool>) plus the /mcp status command",
    async activate(ctx) {
      await activateMcp(ctx, mcpManager, configPath);
    },
    deactivate() {
      return mcpManager.shutdown();
    },
    disabledNotice() {
      return "MCP extension is disabled — external MCP servers (mcp__<server>_<tool>) and the /mcp status command are unavailable.";
    },
  };
}

async function activateMcp(ctx: ExtensionContext, mcpManager: McpManager, configPath?: string): Promise<void> {
  const loadResult = await loadMcpConfig(configPath);

  if (loadResult?.loadErrors) {
    for (const err of loadResult.loadErrors) {
      ctx.logger.warn(err);
    }
  }

  mcpManager.setConfigSource(configPath, loadResult?.sourcePath);

  if (!loadResult || Object.keys(loadResult.config.mcpServers).length === 0) {
    return;
  }

  const tools = await mcpManager.initialize(loadResult.config);

  for (const [name, tool] of Object.entries(tools)) {
    ctx.registerTool({
      name,
      description: tool.description ?? `MCP tool "${name}"`,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      execute: async (input, options) =>
        tool.execute?.(input, {
          toolCallId: options.toolCallId,
          abortSignal: options.abortSignal,
        }),
    });
  }

  ctx.registerCommand({
    name: "mcp",
    description: "List configured MCP servers and their connection status",
    execute: async () => formatMcpStatus(mcpManager.getServerStatuses()),
  });
}

// ============================================================================
// /mcp status formatting (mirrors the previous app-layer builtin command)
// ============================================================================

function formatMcpStatus(servers: McpServerStatus[]): string {
  if (servers.length === 0) {
    return "No MCP servers configured.";
  }

  const lines: string[] = [];
  for (const s of servers) {
    const status = String(s.status ?? "");
    const icon = status === "connected" ? "✓" : "✗";
    let target = "";
    if (s.command) {
      target = `${s.command}${Array.isArray(s.args) ? " " + s.args.join(" ") : ""}`;
    } else if (s.url) {
      target = String(s.url);
    }
    const name = String(s.name ?? "");
    const transport = String(s.transport ?? "");
    const toolCount = Number(s.toolCount ?? 0);
    lines.push(
      `  ${icon} ${name.padEnd(20)} ${transport.padEnd(6)} ${String(toolCount).padStart(3)} tools  ${target}`.trimEnd()
    );
    if (status === "failed" && s.error) {
      lines.push(`      └─ failed: ${s.error}`);
    }
  }

  const connected = servers.filter((s) => s.status === "connected").length;
  const header = `MCP servers (${connected}/${servers.length} connected)`;
  return `${header}:\n${lines.join("\n")}`;
}
