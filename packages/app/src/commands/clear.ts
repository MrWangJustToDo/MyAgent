import { bumpAgentUsage } from "../hooks/use-agent-usage.js";
import { useDynamic } from "../hooks/use-dynamic.js";

import { registerCommand } from "./utils/registry.js";

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

    const store = agent.getSessionStore();
    if (!store) {
      return { ok: false, error: "Session store not available" };
    }

    const usage = agent.usage;
    const currentSession = agent.getSessionData();

    if (currentSession) {
      ctx.saveSessionFromChat?.();
    }

    // Drop plan lifecycle + auto mode before wiping the transcript so approval
    // bypass / read-only restrictions cannot carry into the new session.
    agent.planMode.disable();
    agent.setAutoApproveEnabled(false);

    agent.reset();
    usage.reset();
    bumpAgentUsage();

    // Clear the chat controller's messages and queues (still alive after reset).
    const chatController = agent.getChatController();
    chatController?.clearMessages();

    const newSession = store.create({
      modelStyle: currentSession?.modelStyle ?? "openai",
      model: currentSession?.model ?? "unknown",
    });
    agent.setSessionData(newSession);
    agent.resetAdmittedTurnContext();
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
