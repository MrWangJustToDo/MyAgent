import type { AgentManager } from "./manager-agent.js";
import type { MemoryService } from "./memory-service.js";
import type { SessionService } from "./session-service.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { AgentContext } from "../agent/agent-context";
import type { AgentLog } from "../agent/agent-log";
import type { CompactionConfig } from "../agent/compaction/types.js";
import type { ExtensionRunner } from "../agent/extension/runner.js";
import type { TodoManager } from "../agent/todo-manager";
import type { ModelInfo } from "../models/types.js";
import type { ModelMessage } from "@tanstack/ai";

/** Shared dependencies for TanStack chat middleware during a run. */
export interface AgentRunDeps {
  agentId: string;
  manager: AgentManager;
  context: AgentContext;
  usage: UsageTracker;
  memory: MemoryService;
  session: SessionService;
  log: AgentLog;
  todoManager: TodoManager | null;
  extensionRunner: ExtensionRunner | null;
  compactionConfig: CompactionConfig | null;
  modelInfo: ModelInfo | null;
  getFrozenSystemPrompt: () => string | undefined;
  getTurnContextSnapshot: () => string | undefined;
  shouldTriggerAutoCompact: (messages?: ModelMessage[]) => boolean;
}
