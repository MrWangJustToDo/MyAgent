import { bumpAgentUsage } from "../hooks/use-agent-usage.js";
import { useAgent } from "../hooks/use-agent.js";
import { useDynamic } from "../hooks/use-dynamic.js";

import { registerCommand } from "./utils/registry.js";

registerCommand({
  name: "resume",
  description: "Resume a previous session",
  usage: "/resume [session-id or name]",
  immediate: false,
  allowCustomInput: true,
  getOptions: async () => {
    const session = useAgent.getReadonlyState().session;
    if (!session) return [];

    const listed = await session.dispatch({ type: "session.list" });
    if (!listed.ok) return [];
    const sessions =
      (listed.data as { sessions?: Array<{ id: string; name: string; model: string; updatedAt: number }> } | undefined)
        ?.sessions ?? [];

    return sessions
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20)
      .map((s) => ({
        label: s.name,
        value: s.id,
        description: `${s.model} · ${new Date(s.updatedAt).toLocaleString()}`,
      }));
  },
  execute: async (args, ctx) => {
    const session = ctx.getSession();
    if (!session) {
      return { ok: false, error: "Agent not initialized" };
    }

    const query = args.trim();
    if (!query) {
      return { ok: false, error: "Usage: /resume <session-id or name>" };
    }

    const listed = await session.dispatch({ type: "session.list" });
    if (!listed.ok) return { ok: false, error: listed.error };
    const sessions =
      (listed.data as { sessions?: Array<{ id: string; name: string; model: string }> } | undefined)?.sessions ?? [];

    let sessionId = query;
    const byId = sessions.find((s) => s.id === query);
    if (!byId) {
      const byName = sessions.find((s) => s.name === query || s.name.includes(query));
      if (!byName) {
        return { ok: false, error: `No session found matching "${query}"` };
      }
      sessionId = byName.id;
    }

    const result = await session.dispatch({ type: "session.resume", sessionId });
    if (!result.ok) return { ok: false, error: result.error };

    const data = result.data as
      | { sessionId?: string; name?: string; model?: string; uiMessages?: unknown[] }
      | undefined;

    if (ctx.setMessages && Array.isArray(data?.uiMessages)) {
      ctx.setMessages(data.uiMessages as Parameters<NonNullable<typeof ctx.setMessages>>[0]);
      bumpAgentUsage();
      setTimeout(() => {
        useDynamic.getActions().setDynamicKey(Date.now());
      }, 200);
    }

    return {
      ok: true,
      message: `Resumed session: ${data?.name ?? sessionId} (${data?.model ?? "unknown"})`,
    };
  },
});
