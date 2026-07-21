import { bumpAgentUsage } from "../hooks/use-agent-usage.js";
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

    const usage = agent.usage;
    const currentSession = agent.getSessionData();

    if (currentSession) {
      ctx.saveSessionFromChat?.();
    }

    context.reset();
    usage.reset();
    bumpAgentUsage();

    const newSession = store.create({
      modelStyle: currentSession?.modelStyle ?? "openai",
      model: currentSession?.model ?? "unknown",
    });
    agent.setSessionData(newSession);
    agent.resetSystemPrompt();

    const todoManager = agent.getTodoManager();
    if (todoManager) {
      todoManager.reset();
    }

    if (ctx.setMessages) {
      ctx.setMessages([]);
      setTimeout(() => {
        useDynamic.getActions().setDynamicKey(Date.now());
      }, 100);
    }

    return { ok: true, message: "New session started" };
  },
});
