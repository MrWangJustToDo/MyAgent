/**
 * Type-only host / orchestration surfaces for domain modules.
 * Domain code imports these instead of reaching into `managers/`.
 */

export type { ManagedAgent } from "../managers/managed-agent.js";
export type { AgentManager } from "../managers/agent-manager.js";
export type { UsageTracker } from "../managers/usage-tracker.js";
export type { AgentUIChannel } from "../agent/ui-channel.js";
export type { AgentStatusController } from "../managers/agent-status-controller.js";
