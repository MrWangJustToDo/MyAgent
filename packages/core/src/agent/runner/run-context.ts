import { getEnv } from "../../env.js";

import type { CoreEnv } from "../../env.js";

// ============================================================================
// Tool run context (passed to chat({ context }) and tool execute functions)
// ============================================================================

/**
 * Runtime context for TanStack tool execution and middleware.
 * Forwarded via `chat({ context })` — tools receive it on {@link import("@tanstack/ai").ToolExecutionContext}.context`.
 */
export interface ToolRunContext {
  /** Managed agent id for this run */
  agentId: string;
  /** Workspace CoreEnv (filesystem, shell, fetch) */
  coreEnv: CoreEnv;
}

export function createToolRunContext(agentId: string): ToolRunContext {
  return { agentId, coreEnv: getEnv() };
}
