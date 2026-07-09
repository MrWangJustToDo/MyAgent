import { applyToolCompact } from "../compaction/tool-compact/apply-tool-compact.js";
import { toModelOutputRegistry } from "../tools/tanstack/to-model-output-registry.js";

import type { ManagedAgent } from "../../dev.js";
import type { AgentLog } from "../agent-log";
import type { ToolCompactCache } from "../compaction/tool-compact/tool-compact-cache.js";
import type { ToModelOutputRegistry } from "../compaction/tool-compact/types.js";
import type { CompactionConfig } from "../compaction/types.js";
import type { ToolRunContext } from "../runner/run-context.js";
import type { ChatMiddleware, ModelMessage } from "@tanstack/ai";

export interface ToolCompactMiddlewareDeps {
  getCompactionConfig: () => CompactionConfig | null;
  getToolCompactCache: () => ToolCompactCache;
  getManagedAgent: () => ManagedAgent;
  registry?: ToModelOutputRegistry;
  log?: AgentLog | null;
}

/** Per-tool LLM shaping via `toModelOutput` and recent-window placeholders. */
export function createToolCompactMiddleware(deps: ToolCompactMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  const registry = deps.registry ?? toModelOutputRegistry;

  return {
    name: "tool-compact",
    onConfig: async (_ctx, config) => {
      const messages = config.messages as ModelMessage[];

      const parentId = deps.getManagedAgent().parentId;

      if (parentId) {
        await applyToolCompact(messages, {
          config: deps.getCompactionConfig() ?? undefined,
          registry,
          cache: deps.getToolCompactCache(),
        });

        deps.log?.chat(`After tool-compact messages: ${messages.length}`, { messages });
      }

      return { messages };
    },
  };
}
