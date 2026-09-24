import type { AgentManager } from "./agent-manager.js";
import type { AgentStatusController } from "./controllers/agent-status-controller.js";
import type { ManagedAgentConfig } from "./managed-agent.js";
import type { RunCoordinator } from "./run-coordinator.js";
import type { AgentLog } from "../agent/agent-log";
import type { SessionService } from "./services/session-service.js";
import type { UsageTracker } from "./telemetry/usage-tracker.js";
import type { ToolApprovalTable } from "../agent/approval/tool-approval-table.js";
import type { ToolCompactCache } from "../agent/compaction/tool-compact/tool-compact-cache.js";
import type { CompactionConfig } from "../agent/compaction/types.js";
import type { WireProjectionCache } from "../agent/compaction/wire-projection-cache.js";
import type { ExtensionRunner } from "../agent/extension/runner.js";
import type { PlanModeController } from "../agent/plan/plan-mode-controller.js";
import type { TodoManager } from "../agent/todo";
import type { TurnContextSection } from "../agent/turn-context/turn-context-message.js";
import type { AgentUIChannel } from "../agent/ui-channel.js";
import type { UsageHistoryService } from "../agent/usage/usage-history-service.js";
import type { ModelInfo } from "../models/types.js";
import type { AgentIterationState } from "../runtime-types/session-payloads.js";
import type { ModelMessage, UIMessage as TanStackUIMessage } from "@tanstack/ai";

/**
 * The complete collaborator surface {@link buildAgentRunner} needs from a
 * `ManagedAgent`, so the assembly reads one object instead of reaching into the
 * agent from every factory argument.
 *
 * **Liveness contract.** The bag is built at runner-build time, but the runner it
 * feeds is *cached* (`ensureAgentRunner`): `runnerConfigKey` only watches the tool
 * set, model, sampling and plan phase, so a rebuilt-on-change field would hand
 * middleware a stale reference for the life of the cache. Two groups, and the split
 * is the point of this note:
 *
 * - **Plain fields** are safe to capture because they are assigned exactly once
 *   during construction and never replaced — the `ManagedAgent` collaborators
 *   (`usage`, `memory`, `session`, …), plus `config` and the immutable `parentId`.
 * - **`getX()` accessors** are required for anything that can outlive the build:
 *   the log sink, the models.dev lookup that lands after the first turn, and all
 *   conversation state. Reading these as fields is the bug this shape prevents.
 *
 * Mutation is deliberately out of scope: `setLog` / `setModelInfo` stay on the agent,
 * which is what keeps the dependency one-way.
 *
 * Scope is the runner's needs, not "everything on `ManagedAgent`": `managed.tools`
 * stays out because it is read once inside {@link runnerConfigKey} — the cache key
 * itself — where a live accessor would be meaningless.
 */
export interface AgentRunDeps {
  agentId: string;
  manager: AgentManager;
  usage: UsageTracker;
  session: SessionService;
  usageHistory: UsageHistoryService;
  statusController: AgentStatusController;
  approvals: ToolApprovalTable;
  run: RunCoordinator;
  planMode: PlanModeController;
  /** Set-once in practice, but `setLog` is public — read live to be safe. */
  getLog: () => AgentLog;
  getTodoManager: () => TodoManager | null;
  getExtensionRunner: () => ExtensionRunner | null;
  getCompactionConfig: () => CompactionConfig | null;
  getModelInfo: () => ModelInfo | null;
  getToolCompactCache: () => ToolCompactCache;
  getWireProjectionCache: () => WireProjectionCache;
  getSystemPrompt: () => string | undefined;
  getFrozenSystemPrompt: () => string | undefined;
  /**
   * Normalised to `null` (its heaviest reader, `compaction`, matches `null`). The two
   * consumers that match `undefined` wrap this at their own call site rather than the
   * bag widening to `| null | undefined` — a union would be assignable to neither
   * narrow interface, forcing a cast in the assembly this refactor exists to remove.
   */
  getUIChannel: () => AgentUIChannel | null;
  /** Assigned once at construction, so capturing it cannot go stale. */
  config: Readonly<ManagedAgentConfig>;
  /** Immutable after construction. */
  parentId: string | undefined;
  shouldTriggerAutoCompact: (messages?: ModelMessage[]) => boolean;
  shouldPersistUIMessage: (messages: TanStackUIMessage[], reason: "user-message") => void;
  setIterationProgress: (state: AgentIterationState) => void;
  getDynamicTurnContextSections: () => Promise<TurnContextSection[]>;
  getAdmittedContextHashes: () => Map<string, string> | undefined;
  setAdmittedContextHashes: (hashes: Map<string, string> | undefined) => void;
  getTurnContextAdmitMessageCount: () => number;
  setTurnContextAdmitMessageCount: (count: number) => void;
  commitSurfacedMemories: () => void;
}
