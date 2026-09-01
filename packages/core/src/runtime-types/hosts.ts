/**
 * Type-only host / orchestration surfaces for domain modules.
 * Domain code imports these instead of reaching into `managers/`.
 */

export type { ManagedAgent } from "../managers/managed-agent.js";
export type { AgentManager } from "../managers/agent-manager.js";
export type { UsageTracker } from "../managers/telemetry/usage-tracker.js";
export type { AgentUIChannel } from "../agent/ui-channel.js";
export type { AgentStatusController } from "../managers/controllers/agent-status-controller.js";
