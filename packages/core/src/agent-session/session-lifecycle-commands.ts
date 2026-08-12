/**
 * Session-side helpers for rename / new-session commands (Host process only).
 */

import { extractTextFromContent } from "../agent/compaction/message-utils.js";
import { resolveTextAdapterForManaged } from "../managers/run-agent.js";
import { runSideTextQuery } from "../models/side-text-query.js";

import type { ManagedAgent } from "../managers/managed-agent.js";

export async function generateAndApplySessionTitle(
  managed: ManagedAgent
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const session = managed.getSessionData();
  const store = managed.getSessionStore();
  if (!session || !store) {
    return { ok: false, error: "No active session" };
  }

  const textAdapter = await resolveTextAdapterForManaged(managed);
  if (!textAdapter) {
    return { ok: false, error: "No text adapter available for title generation" };
  }

  const messages = managed.getCanonicalFromUI();
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

  try {
    managed.getLog()?.info("chat", "Generating title...", { recentText });
    const { text, usage } = await runSideTextQuery(textAdapter, {
      systemPrompt:
        "Generate a concise title (3-8 words) for the following conversation. Return ONLY the title, no quotes or punctuation.",
      userPrompt: recentText,
      maxOutputTokens: 60,
    });
    if (usage) {
      managed.usage.addTotal(usage);
    }
    const generated = text.trim().slice(0, 80);
    if (!generated) {
      return { ok: false, error: "Failed to generate title" };
    }
    session.name = generated;
    managed.name = generated;
    await store.save(session);
    managed.getLog()?.info("chat", "Title generated", { text: generated });
    return { ok: true, name: generated };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { ok: false, error: `Title generation failed: ${err.message}` };
  }
}

export async function applySessionRename(
  managed: ManagedAgent,
  name: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Name is required" };
  }
  const session = managed.getSessionData();
  const store = managed.getSessionStore();
  managed.name = trimmed;
  if (session && store) {
    session.name = trimmed;
    await store.save(session);
  }
  return { ok: true, name: trimmed };
}

export async function startNewDiskSession(
  managed: ManagedAgent
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const store = managed.getSessionStore();
  if (!store) {
    return { ok: false, error: "Session store not available" };
  }

  const usage = managed.usage;
  const currentSession = managed.getSessionData();

  managed.disablePlanMode();
  managed.setAutoModeEnabled(false);
  managed.reset();
  usage.reset();

  const chatController = managed.getChatController();
  chatController?.clearMessages();

  const newSession = store.create({
    modelStyle: currentSession?.modelStyle ?? "openai",
    model: currentSession?.model ?? "unknown",
  });
  managed.setSessionData(newSession);
  managed.resetAdmittedTurnContext();
  managed.resetSystemPrompt();
  managed.getTodoManager()?.reset();

  return { ok: true, sessionId: newSession.id };
}
