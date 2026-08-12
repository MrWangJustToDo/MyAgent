import { bumpAgentUsage } from "../hooks/use-agent-usage.js";
import { useDynamic } from "../hooks/use-dynamic.js";
import { useTodoManager } from "../hooks/use-todo-manager.js";

import { registerCommand } from "./utils/registry.js";

registerCommand({
  name: "clear",
  description: "Clear the screen and start a new session",
  usage: "/clear",
  immediate: true,
  execute: async (_args, ctx) => {
    const session = ctx.getSession();
    if (!session) {
      return { ok: false, error: "Agent not initialized" };
    }

    ctx.saveSessionFromChat?.();
    const result = await session.dispatch({ type: "session.new" });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    bumpAgentUsage();
    useTodoManager.getActions().clear();

    if (ctx.setMessages) {
      ctx.setMessages([]);
      setTimeout(() => {
        useDynamic.getActions().setDynamicKey(Date.now());
      }, 100);
    }

    return { ok: true, message: "New session started" };
  },
});
