import { agentManager, extractTextFromContent, runSideTextQuery, resolveTextAdapterForManaged } from "@my-agent/core";
import { toRaw } from "reactivity-store";

import { registerCommand } from "./registry.js";

import type { AgentLog } from "@my-agent/core";

registerCommand({
  name: "rename",
  description: "Rename current session (or auto-generate a title)",
  usage: "/rename [title]",
  immediate: false,
  execute: async (args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const session = agent.getSessionData();
    const store = agent.getSessionStore();
    if (!session || !store) {
      return { ok: false, error: "No active session" };
    }

    const title = args.trim();

    if (title) {
      session.name = title;
      await store.save(session);
      return { ok: true, message: `Session renamed: ${title}` };
    }

    const context = toRaw(agent.getContext());
    if (!context) {
      return { ok: false, error: "No context available" };
    }

    const managed = agentManager.getAgent(agent.id);
    if (!managed) {
      return { ok: false, error: "Managed agent not found" };
    }

    const textAdapter = await resolveTextAdapterForManaged(managed);
    if (!textAdapter) {
      return { ok: false, error: "No text adapter available for title generation" };
    }

    const messages = context.getMessages();
    const recentText = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-4)
      .map((m) => extractTextFromContent(m.content))
      .filter(Boolean)
      .join("\n")
      .slice(-1000);

    if (!recentText) {
      return { ok: false, error: "No conversation content to generate title from" };
    }

    ctx.inputActions.setInputFeedback("Generating title...", "info");

    try {
      const agentLog = toRaw(agent.getLog()) as AgentLog | null;

      agentLog?.info("chat", "Generating title...", { recentText });

      const { text, usage } = await runSideTextQuery(textAdapter, {
        systemPrompt:
          "Generate a concise title (3-8 words) for the following conversation. Return ONLY the title, no quotes or punctuation.",
        userPrompt: recentText,
        maxOutputTokens: 60,
      });

      if (usage) {
        managed.usage.addTotal(usage);
      }

      agentLog?.info("chat", "Title generated", { text });

      const generated = text.trim().slice(0, 80);
      if (!generated) {
        return { ok: false, error: "Failed to generate title" };
      }

      session.name = generated;
      await store.save(session);
      return { ok: true, message: `Session renamed: ${generated}` };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { ok: false, error: `Title generation failed: ${err.message}` };
    }
  },
});
