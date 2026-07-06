import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { TodoManager } from "../todo-manager";
import type { LanguageModel } from "ai";

/** Shared runtime surface for composed agent loop services. */
export interface AgentLoopHost {
  agentId: string;
  model: LanguageModel | null;
  log: AgentLog | null;
  context: AgentContext | null;
  todoManager: TodoManager | null;
}
