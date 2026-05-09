import { generateText } from "ai";

import { registerCommand } from "./registry.js";

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
      // Manual rename
      session.name = title;
      await store.save(session);
      return { ok: true, message: `Session renamed: ${title}` };
    }

    // Auto-generate title using LLM
    const model = agent.getModel();
    if (!model) {
      return { ok: false, error: "No model available for title generation" };
    }

    const context = agent.getContext();
    if (!context) {
      return { ok: false, error: "No context available" };
    }

    const messages = context.getMessages();
    const recentText = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-4)
      .map((m) => {
        if (typeof m.content === "string") return m.content;
        if (Array.isArray(m.content)) {
          const part = m.content.find((p) => (p as Record<string, unknown>).type === "text") as Record<string, unknown>;
          return (part?.text as string) || "";
        }
        return "";
      })
      .join("\n")
      .slice(-1000);

    if (!recentText) {
      return { ok: false, error: "No conversation content to generate title from" };
    }

    ctx.inputActions.setInputFeedback("Generating title...", "info");

    try {
      const { text } = await generateText({
        model,
        maxTokens: 30,
        system:
          "Generate a concise title (3-8 words) for the following conversation. Return ONLY the title, no quotes or punctuation.",
        prompt: recentText,
      });

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
