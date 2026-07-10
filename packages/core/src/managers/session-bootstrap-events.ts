import { formatAgentDocResult } from "../agent/agent-doc-loader.js";

import { emitAgentEvent } from "./emit-agent-event.js";

import type { ManagedAgent } from "./managed-agent.js";

export interface SessionBootstrapContext {
  cwd: string;
  mcpConfigPath?: string;
  mcpConfigLoadedFrom?: string;
}

/**
 * Emit session bootstrap events after the agent is registered on {@link AgentManager}.
 * Reads loaded resources from the managed agent rather than duplicating bootstrap state.
 */
export async function emitSessionBootstrapEvents(
  managed: ManagedAgent,
  context: SessionBootstrapContext
): Promise<void> {
  const docContent = managed.getAgentDocContent();
  const docSource = managed.agentDocSource;

  if (docContent) {
    emitAgentEvent(managed, "session:doc", {
      data: {
        source: docSource,
        length: docContent.length,
        message: formatAgentDocResult({
          content: docContent,
          source: docSource || undefined,
        }),
      },
    });
  }

  const skillRegistry = managed.getSkillRegister();
  if (skillRegistry) {
    emitAgentEvent(managed, "session:skill", {
      data: {
        count: skillRegistry.size,
        names: skillRegistry.names(),
      },
    });
  }

  const mcpManager = managed.getMcpManager();
  const servers = mcpManager?.getServerStatuses() ?? [];
  emitAgentEvent(managed, "session:mcp", {
    data: {
      configPath: context.mcpConfigPath,
      configLoadedFrom: context.mcpConfigLoadedFrom,
      servers,
      toolCount: servers.reduce((sum, server) => sum + server.toolCount, 0),
    },
  });

  const memoryManager = managed.memory.getManager();
  if (memoryManager) {
    const memories = await memoryManager.listMemories();
    emitAgentEvent(managed, "session:memory", {
      data: {
        memoryCount: memories.length,
        indexLength: memoryManager.getIndexContent().length,
      },
    });
  }

  emitAgentEvent(managed, "session:start", { data: { cwd: context.cwd } });
}
