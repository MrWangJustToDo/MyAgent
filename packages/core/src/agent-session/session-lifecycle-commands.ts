/**
 * Session-side helpers for rename / new-session commands (Host process only).
 */

import { extractTextFromContent } from "../agent/compaction/message-utils.js";
import { resolveTextAdapterForManaged } from "../managers/run-agent.js";
import { runSideTextQuery } from "../models/adapter/side-text-query.js";

import { PR_SUMMARY_SYSTEM_PROMPT, TITLE_SYSTEM_PROMPT } from "./session-summary-prompt.js";

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
      systemPrompt: TITLE_SYSTEM_PROMPT,
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

/**
 * Generate a PR-style summary of the current session (side query, no agent loop).
 *
 * The summary is returned to the caller — it is NOT stored on the session.
 * Use for PR descriptions, commit messages, or hand-off notes.
 */
export async function generateSessionSummary(
  managed: ManagedAgent
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const textAdapter = await resolveTextAdapterForManaged(managed);
  if (!textAdapter) {
    return { ok: false, error: "No text adapter available for summary generation" };
  }

  const messages = managed.getCanonicalFromUI();
  const conversationText = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => extractTextFromContent(m.content))
    .filter(Boolean)
    .join("\n")
    .slice(-8000);

  if (!conversationText) {
    return { ok: false, error: "No conversation content to summarize" };
  }

  try {
    managed.getLog()?.info("chat", "Generating PR-style summary...", {
      conversationLength: conversationText.length,
    });
    const { text, usage } = await runSideTextQuery(textAdapter, {
      systemPrompt: PR_SUMMARY_SYSTEM_PROMPT,
      userPrompt: conversationText,
      maxOutputTokens: 500,
    });
    if (usage) {
      managed.usage.addTotal(usage);
    }
    const summary = text.trim();
    if (!summary) {
      return { ok: false, error: "Failed to generate summary" };
    }
    managed.getLog()?.info("chat", "PR-style summary generated", { summaryLength: summary.length });
    return { ok: true, summary };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { ok: false, error: `Summary generation failed: ${err.message}` };
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
  managed.setDisplayName(trimmed);
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

  // Starting a brand-new disk session relinquishes the previous session's
  // ownership so another live agent may resume it.
  if (currentSession?.id) {
    managed.manager?.releaseSessionOwnership(currentSession.id, managed.id);
  }


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
