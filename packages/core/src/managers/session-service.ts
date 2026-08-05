/**
 * SessionService — session persistence.
 * `uiMessages` are written only when callers pass them (app `useChat` layer).
 * When uiMessages are provided, they are dehydrated (base64 → `media://` refs)
 * before writing to disk. Runtime (hydrated) messages are never mutated.
 */

import { getFirstUserInput } from "../agent/compaction/message-utils.js";
import { dehydrateUIMessages, hydrateUIMessages } from "../agent/media/media-utils.js";
import { runSideTextQuery } from "../models/side-text-query.js";

import type { EmitAgentEventFn } from "./emit-agent-event.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { AgentContext } from "../agent/agent-context";
import type { PlanModeState } from "../agent/plan/plan-mode-controller.js";
import type { SessionStore } from "../agent/session/session-store.js";
import type { SessionData } from "../agent/session/types.js";
import type { TodoManager } from "../agent/todo-manager";
import type { TextAdapterConfig } from "../models/adapter-factory.js";
import type { UIMessage } from "@tanstack/ai";

export interface SessionPersistInput {
  context: AgentContext;
  usage: UsageTracker;
  todoManager: TodoManager | null;
  /** Current plan-mode snapshot; null/undefined when off. */
  planMode?: PlanModeState | null;
  /** Auto-approve (skip all tool approvals) flag. */
  autoApprove?: boolean;
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
   * Persist session model state. Pass `uiMessages` only from the app `useChat` layer.
   * When uiMessages are provided, they are dehydrated (clone → extract base64 → media:// refs)
   * before writing. The original uiMessages array is never mutated.
   */
  async persistSession(input: SessionPersistInput): Promise<void> {
    const { context, usage, todoManager, planMode, autoApprove, resolveTextAdapter, emitEvent, uiMessages } = input;
    if (!this.store || !context) return;
    if (!this.data) {
      this.ensureSession();
      await this.persistSession(input);
      return;
    }

    // const messages = context.getMessages();

    this.data.summaryMessage = context.getSummaryMessage();
    this.data.compactIndex = context.getCompactIndex();
    this.data.usage = { ...usage.getTotal() };
    this.data.cost = usage.getTotalCostUsd();
    this.data.contextTokens = usage.getWindowUsage().inputTokens;

    if (todoManager) {
      this.data.todos = todoManager.getItems();
      this.data.todoTitle = todoManager.getTitle();
      this.data.todoPlanBound = todoManager.isPlanBound();
    }

    if (planMode !== undefined) {
      this.data.planMode = !planMode || planMode.phase === "off" ? null : { ...planMode, steps: [...planMode.steps] };
    }

    if (autoApprove !== undefined) {
      this.data.autoApprove = autoApprove;
    }

    if (uiMessages !== undefined) {
      // Clone → dehydrate — never mutate the original runtime messages.
      // The dehydrated version (media:// refs) is written to disk;
      // runtime UIMessages keep their hydrated data URLs for UI/LLM use.
      const dehydrated = await dehydrateUIMessages(uiMessages);
      this.data.uiMessages = dehydrated;
    }

    if (this.data.name === "New Session") {
      const firstUserText = getFirstUserInput(uiMessages || []);
      this.generateSessionTitle(firstUserText, { usage, resolveTextAdapter }).then((title) => {
        if (this.data && this.store) {
          this.data.name = title;
          this.store.save(this.data).catch(() => {});
        }
      });
    }

    const saveTarget = uiMessages !== undefined ? "session+uiMessages" : "session";
    this.store.save(this.data).catch((err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      emitEvent?.("session:save-error", { target: saveTarget, error: errorMsg });
    });
  }

  /**
   * Restore conversation, usage, and todos from a persisted session.
   * Hydrates media:// refs back to data URLs / raw base64 on load.
   * Old sessions (without mediaRef metadata) are handled gracefully.
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

    // Hydrate media:// refs back to data URLs / raw base64.
    // Old sessions (no mediaRef metadata) are handled gracefully by hydrateUIMessages.
    const hydrated = await hydrateUIMessages(session.uiMessages);

    context.setUIMessages(hydrated);
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
        todoManager.restoreTodos(session.todos, {
          title: session.todoTitle,
          planBound: session.todoPlanBound,
        });
      } else {
        todoManager.reset();
      }
    }

    // Keep this.data dehydrated (media:// refs) so model-only persistSession
    // doesn't write big base64 back to disk. The return value has hydrated
    // uiMessages so callers (agent-manager, managed-agent-session) get data URLs.
    this.setSessionData(session);

    return {
      ...session,
      uiMessages: hydrated,
    };
  }
}
