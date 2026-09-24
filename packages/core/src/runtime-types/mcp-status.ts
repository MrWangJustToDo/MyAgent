/**
 * MCP server status — the display shape shared across layers.
 *
 * Declared here rather than in `agent/mcp/manager.ts` because it is consumed by
 * `runtime-types/agent-event-payloads.ts` (the `session:mcp` payload) as well as by
 * `agent/` and `agent-session/`. Keeping the interface with its implementation made
 * the shared leaf depend upward on the MCP manager, which is the one direction the
 * leaf cannot afford — `runtime-types` is meant to be importable by every layer.
 *
 * `agent/mcp/manager.ts` re-exports this type, so MCP-internal call sites are
 * unaffected.
 */

/** Public status of one configured MCP server, for display (CLI `/mcp`, app panel). */
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
