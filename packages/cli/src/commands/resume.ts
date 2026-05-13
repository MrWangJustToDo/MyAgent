import { agentManager } from "@my-agent/core";

import { useDynamic } from "../hooks/use-dynamic.js";

import { registerCommand } from "./registry.js";

registerCommand({
  name: "resume",
  description: "Resume a previous session",
  usage: "/resume [session-id or name]",
  immediate: false,
  getOptions: async () => {
    const { useAgent } = await import("../hooks/use-agent.js");
    const agent = useAgent.getReadonlyState().agent;
    if (!agent) return [];

    const store = agent.getSessionStore();
    if (!store) return [];

    const sessions = await store.list();
    return sessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20)
      .map((s) => ({
        label: s.name,
        value: s.id,
        description: `${s.model} · ${new Date(s.updatedAt).toLocaleString()}`,
      }));
  },
  execute: async (args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const store = agent.getSessionStore();
    if (!store) {
      return { ok: false, error: "Session store not available" };
    }

    const query = args.trim();
    if (!query) {
      return { ok: false, error: "Usage: /resume <session-id or name>" };
    }

    try {
      let sessionId = query;

      // Try loading by ID first, then fall back to name search
      const directLoad = await store.load(query);
      if (!directLoad) {
        const matches = await store.findByName(query);
        if (matches.length === 0) {
          return { ok: false, error: `No session found matching "${query}"` };
        }
        sessionId = matches[0].id;
      }

      const result = await agentManager.resumeSession(agent.id, sessionId);

      if (ctx.setMessages && result.uiMessages) {
        ctx.setMessages(result.uiMessages);
        setTimeout(() => {
          useDynamic.getActions().setDynamicKey(Date.now());
        }, 100);
      }

      return {
        ok: true,
        message: `Resumed session: ${result.session.name} (${result.session.model})`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { ok: false, error: `Resume failed: ${err.message}` };
    }
  },
});
