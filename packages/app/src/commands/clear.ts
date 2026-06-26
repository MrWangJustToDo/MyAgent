import { useAgentContext } from "../hooks/use-agent-context.js";
import { useDynamic } from "../hooks/use-dynamic.js";

import { registerCommand } from "./registry.js";

registerCommand({
  name: "clear",
  description: "Clear the screen and start a new session",
  usage: "/clear",
  immediate: true,
  execute: async (_args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const context = agent.getContext();
    const store = agent.getSessionStore();

    if (!context || !store) {
      return { ok: false, error: "Agent context or session store not available" };
    }

    // Save current session before clearing
    const currentSession = agent.getSessionData();
    if (currentSession) {
      currentSession.summaryMessage = context.getSummaryMessage();
      currentSession.compactIndex = context.getCompactIndex();
      currentSession.usage = context.getTotalUsage();
      currentSession.cost = context.getTotalCost();
      currentSession.contextTokens = context.getUsage().inputTokens;
      await store.save(currentSession);
    }

    // Reset agent context (messages, usage, events)
    context.reset();
    useAgentContext.getActions().bump();

    // Create and set a new session
    const newSession = store.create({
      provider: currentSession?.provider ?? "unknown",
      model: currentSession?.model ?? "unknown",
    });
    agent.setSessionData(newSession);

    // Reset todo manager if available
    const todoManager = agent.getTodoManager();
    if (todoManager) {
      todoManager.reset();
    }

    // Clear UI messages
    if (ctx.setMessages) {
      ctx.setMessages([]);
      setTimeout(() => {
        useDynamic.getActions().setDynamicKey(Date.now());
      }, 100);
    }

    return { ok: true, message: "New session started" };
  },
});
