import { z } from "zod";

// ============================================================================
// MCP Server Configuration Types
// ============================================================================

/** Stdio transport: spawns a child process */
export const mcpServerConfigStdioSchema = z.object({
  transport: z.literal("stdio"),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export type McpServerConfigStdio = z.infer<typeof mcpServerConfigStdioSchema>;

/** SSE or HTTP transport: connects to a remote URL */
export const mcpServerConfigHttpSchema = z.object({
  transport: z.enum(["sse", "http"]),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type McpServerConfigHttp = z.infer<typeof mcpServerConfigHttpSchema>;

/** Union of all server config types */
export const mcpServerConfigSchema = z.union([mcpServerConfigStdioSchema, mcpServerConfigHttpSchema]);

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

// ============================================================================
// MCP Config File Schema
// ============================================================================

/** Top-level MCP configuration (matches .opencode/mcp.json) */
export const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerConfigSchema),
});

export type McpConfig = z.infer<typeof mcpConfigSchema>;
