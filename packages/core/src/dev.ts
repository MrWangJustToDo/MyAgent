/**
 * Internal re-exports for core validation scripts (`pnpm validate:*`).
 * Not part of the public `@my-agent/core` package API.
 */

export * from "./dev-agent.js";
export * from "./dev-managers.js";
export * from "./dev-models.js";

// Root-level modules
export { Emitter } from "./utils/emitter.js";
export {
  AGENT_SESSION_CHANNELS,
  DEFAULT_AGENT_SESSION_CHANNELS,
  DEFAULT_SESSION_LIFECYCLE_EVENTS,
  createLocalAgentSession,
  createLocalAgentSessionHost,
  sessionForSubagent,
} from "./agent-session";
export { generateId, resetGeneratedIdsForTesting } from "./utils/generate-id.js";
export { clearCoreEnv, registerCoreEnv } from "./env.js";
export type { CoreEnv } from "./env.js";
// ============================================================================
// Built-in LSP extension (internal validation exports — not part of public API)
// ============================================================================
// ============================================================================
// Built-in Memory extension (internal validation exports — not part of public API)
// ============================================================================
// ============================================================================
// Built-in Skills extension (internal validation exports — not part of public API)
// ============================================================================
