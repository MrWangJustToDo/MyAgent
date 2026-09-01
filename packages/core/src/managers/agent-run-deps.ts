import type { AgentManager } from "./agent-manager.js";
import type { MemoryService } from "./services/memory-service.js";
import type { SessionService } from "./services/session-service.js";
import type { UsageTracker } from "./telemetry/usage-tracker.js";
import type { AgentLog } from "../agent/agent-log";
import type { CompactionConfig } from "../agent/compaction/types.js";
import type { ExtensionRunner } from "../agent/extension/runner.js";
import type { TodoManager } from "../agent/todo-manager";
import type { AgentUIChannel } from "../agent/ui-channel.js";
import type { ModelInfo } from "../models/types.js";
import type { ModelMessage } from "@tanstack/ai";

/** Shared dependencies for TanStack chat middleware during a run. */
export interface AgentRunDeps {
  agentId: string;
  manager: AgentManager;
  usage: UsageTracker;
  memory: MemoryService;
  session: SessionService;
  log: AgentLog;
  todoManager: TodoManager | null;
  extensionRunner: ExtensionRunner | null;
  compactionConfig: CompactionConfig | null;
  modelInfo: ModelInfo | null;
  getFrozenSystemPrompt: () => string | undefined;
  getUIChannel: () => AgentUIChannel | null;
  shouldTriggerAutoCompact: (messages?: ModelMessage[]) => boolean;
}
