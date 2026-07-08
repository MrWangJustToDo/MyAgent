/**
 * SessionService — session persistence and UI message sync.
 * Cross-subsystem data is passed in via input objects; no back-references to other services.
 */

import { runSideTextQuery } from "../models/side-text-query.js";

import type { EmitAgentEventFn } from "./emit-agent-event.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { AgentContext } from "../agent/agent-context";
import type { SessionStore } from "../agent/session/session-store.js";
import type { SessionData } from "../agent/session/types.js";
import type { TodoManager } from "../agent/todo-manager";
import type { TextAdapterConfig } from "../models/adapter-factory.js";
import type { UIMessage } from "@tanstack/ai";

export interface SessionPersistInput {
  context: AgentContext;
  usage: UsageTracker;
  todoManager: TodoManager | null;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  emitEvent?: EmitAgentEventFn;
  uiMessages?: UIMessage[];
}

export interface SessionRestoreInput {
  context: AgentContext;
  usage: UsageTracker;
  todoManager: TodoManager | null;
}

export class SessionService {
  private store: SessionStore | null = null;
  private data: SessionData | null = null;
  private config: { modelStyle: string; model: string } | null = null;

  setStore(store: SessionStore, config: { modelStyle: string; model: string }): void {
    this.store = store;
    this.config = config;
  }

  getStore(): SessionStore | null {
    return this.store;
  }

  setSessionData(data: SessionData): void {
    this.data = data;
  }

  getSessionData(): SessionData | null {
    return this.data;
  }

  private ensureSession(): void {
    if (this.data || !this.store || !this.config) return;
    this.data = this.store.create({
      modelStyle: this.config.modelStyle,
      model: this.config.model,
    });
  }

  private async generateSessionTitle(
    userMessage: string,
    input: Pick<SessionPersistInput, "usage" | "resolveTextAdapter">
  ): Promise<string> {
    const { usage, resolveTextAdapter } = input;
    const textAdapter = (await resolveTextAdapter?.()) ?? null;
    if (!textAdapter) return userMessage.slice(0, 50);
    try {
      const { text, usage: queryUsage } = await runSideTextQuery(textAdapter, {
        systemPrompt:
          "Generate a concise title (3-8 words) for a conversation that starts with the following message. Return ONLY the title, no quotes or punctuation.",
        userPrompt: userMessage.slice(0, 500),
        maxOutputTokens: 30,
      });

      if (queryUsage) {
        usage.addTotal(queryUsage);
      }

      return text.slice(0, 80) || userMessage.slice(0, 50);
    } catch {
      return userMessage.slice(0, 50);
    }
  }

  /**
   * Persist session model state and optionally UI messages in a single write.
   */
  persistSession(input: SessionPersistInput): void {
    const { context, usage, todoManager, resolveTextAdapter, emitEvent, uiMessages } = input;
    if (!this.store || !context) return;
    if (!this.data) {
      this.ensureSession();
      this.persistSession(input);
      return;
    }

    const messages = context.getMessages();

    this.data.summaryMessage = context.getSummaryMessage();
    this.data.compactIndex = context.getCompactIndex();
    this.data.usage = { ...usage.getTotal() };
    this.data.cost = usage.getTotalCostUsd();
    this.data.contextTokens = usage.getWindowUsage().inputTokens;

    if (todoManager) {
      this.data.todos = todoManager.getItems();
    }

    if (uiMessages !== undefined) {
      this.data.uiMessages = uiMessages;
    }

    if (this.data.name === "New Session") {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) {
        const text =
          typeof firstUser.content === "string"
            ? firstUser.content
            : Array.isArray(firstUser.content)
              ? firstUser.content.find((p) => p.type === "text")?.content || ""
              : "";
        if (typeof text === "string" && text.length > 0) {
          this.generateSessionTitle(text as string, { usage, resolveTextAdapter }).then((title) => {
            if (this.data && this.store) {
              this.data.name = title;
              this.store.save(this.data).catch(() => {});
            }
          });
        }
      }
    }

    const saveTarget = uiMessages !== undefined ? "session+uiMessages" : "session";
    this.store.save(this.data).catch((err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      emitEvent?.("session:save-error", { target: saveTarget, error: errorMsg });
    });
  }

  /**
   * Restore conversation, usage, and todos from a persisted session.
   * @throws if store/context unavailable or session not found
   */
  async restoreFromStore(sessionId: string, input: SessionRestoreInput): Promise<SessionData> {
    if (!this.store) throw new Error("Session store not available");

    const session = await this.store.load(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const { context, usage, todoManager } = input;
    if (!context) throw new Error("Agent context not available");

    context.reset();
    usage.reset();

    context.setUIMessages(session.uiMessages);
    context.setSummaryMessage(session.summaryMessage ?? null);
    context.setCompactIndex(session.compactIndex ?? 0);

    if (session.usage) {
      usage.addTotal(session.usage);
    }
    if (session.contextTokens) {
      usage.updateWindowUsage({
        inputTokens: session.contextTokens,
        outputTokens: 0,
        totalTokens: session.contextTokens,
      });
    }
    if (session.cost != null) {
      usage.setTotalCostUsd(session.cost);
    }

    if (todoManager) {
      if (session.todos?.length) {
        todoManager.restoreTodos(session.todos);
      } else {
        todoManager.reset();
      }
    }

    this.setSessionData(session);
    return session;
  }
}
