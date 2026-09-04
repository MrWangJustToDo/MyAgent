/**
 * SessionService — session persistence.
 * `uiMessages` are written only when callers pass them (app `useChat` layer).
 * When uiMessages are provided, they are dehydrated (base64 → `media://` refs)
 * before writing to disk. Runtime (hydrated) messages are never mutated.
 */

import { normalizeSessionApprovals } from "../../agent/approval/tool-approval-table.js";
import { getFirstUserInput } from "../../agent/compaction/message-utils.js";
import { dehydrateUIMessages, hydrateUIMessages } from "../../agent/media/media-utils.js";
import { runSideTextQuery } from "../../models/adapter/side-text-query.js";

import type { SessionStore } from "../../agent/persistence/session-store.js";
import type { SessionData, ToolApprovalRecord } from "../../agent/persistence/types.js";
import type { PlanModeState } from "../../agent/plan/plan-mode-controller.js";
import type { TodoManager } from "../../agent/todo";
import type { TextAdapterConfig } from "../../models/adapter/adapter-factory.js";
import type { ReasoningEffort } from "../../models/types.js";
import type { EmitAgentTelemetryFn } from "../telemetry/emit-agent-telemetry.js";
import type { UsageTracker } from "../telemetry/usage-tracker.js";
import type { UIMessage } from "@tanstack/ai";

export interface SessionPersistInput {
  usage: UsageTracker;
  todoManager: TodoManager | null;
  /** Current plan-mode snapshot; null/undefined when off. */
  planMode?: PlanModeState | null;
  /** Auto-approve (skip all tool approvals) flag. */
  autoMode?: boolean;
  /** Tool-approval interrupt table; omitted means leave existing / empty. */
  approvals?: ToolApprovalRecord[];
  /** Reasoning effort level to persist with this session. */
  reasoningEffort?: ReasoningEffort;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  emitEvent?: EmitAgentTelemetryFn;
  uiMessages?: UIMessage[];
}

export interface SessionRestoreInput {
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

  /** Update the model used for new sessions (model switch via `ManagedAgent.setModel`). */
  setModelConfig(modelStyle: string, model: string): void {
    if (this.config) {
      this.config.modelStyle = modelStyle;
      this.config.model = model;
    }
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
    try {
      const textAdapter = (await resolveTextAdapter?.()) ?? null;
      if (!textAdapter) return userMessage.slice(0, 50);
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
   * Single save + error-emit path used by both the main persist and the
   * async title save, so a failure is always surfaced (never silently dropped).
   */
  private async saveToStore(emitEvent: EmitAgentTelemetryFn | undefined, target: string): Promise<void> {
    if (!this.store || !this.data) return;
    try {
      await this.store.save(this.data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      emitEvent?.("session:save-error", { target, error: errorMsg });
    }
  }

  /**
   * Persist session model state. Pass `uiMessages` only from the app `useChat` layer.
   * When uiMessages are provided, they are dehydrated (clone → extract base64 → media:// refs)
   * before writing. The original uiMessages array is never mutated.
   */
  async persistSession(input: SessionPersistInput): Promise<void> {
    const {
      usage,
      todoManager,
      planMode,
      autoMode,
      approvals,
      reasoningEffort,
      resolveTextAdapter,
      emitEvent,
      uiMessages,
    } = input;
    if (!this.store) return;
    if (!this.data) {
      this.ensureSession();
      await this.persistSession(input);
      return;
    }

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

    if (autoMode !== undefined) {
      this.data.autoMode = autoMode;
    }

    if (approvals !== undefined) {
      this.data.approvals = approvals;
    }

    // `in` check: explicit undefined (e.g. `/effort off`) also clears the field.
    if ("reasoningEffort" in input) {
      this.data.reasoningEffort = reasoningEffort;
    }

    if (uiMessages !== undefined) {
      const dehydrated = await dehydrateUIMessages(uiMessages);
      this.data.uiMessages = dehydrated;
    }

    if (this.data.name === "New Session") {
      const firstUserText = getFirstUserInput(uiMessages || []);
      this.generateSessionTitle(firstUserText, { usage, resolveTextAdapter }).then((title) => {
        if (this.data) {
          // Skip empty/whitespace titles (e.g. a no-uiMessages persist passes an
          // empty first user text) so the name stays "New Session" and a later
          // persist with real messages can regenerate it.
          const trimmed = title.trim();
          if (!trimmed) return;
          this.data.name = trimmed;
          // Reuse the unified save path so a title-write failure also emits
          // `session:save-error` (target "session-title").
          void this.saveToStore(emitEvent, "session-title");
        }
      });
    }

    const saveTarget = uiMessages !== undefined ? "session+uiMessages" : "session";
    // Await so callers that `await persistSession` observe durability; emit on
    // failure (do not rethrow — persist remains best-effort for fire-and-forget hosts).
    await this.saveToStore(emitEvent, saveTarget);
  }

  /**
   * Restore usage, todos, and uiMessages from a persisted session.
   * Hydrates for the return value, then re-dehydrates into `this.data` and
   * writes the canonical form back to disk (repairs stringified multimodal, etc.).
   */
  async restoreFromStore(sessionId: string, input: SessionRestoreInput): Promise<SessionData> {
    if (!this.store) throw new Error("Session store not available");

    const session = await this.store.load(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const { usage, todoManager } = input;
    usage.reset();

    const hydrated = await hydrateUIMessages(session.uiMessages);
    // Canonicalize on disk: repair stringified multimodal + extract media:// refs.
    const dehydrated = await dehydrateUIMessages(hydrated);
    session.uiMessages = dehydrated;
    session.approvals = normalizeSessionApprovals({
      approvals: session.approvals,
      uiMessages: hydrated,
    });

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

    this.setSessionData(session);
    await this.store.save(session);

    return {
      ...session,
      uiMessages: hydrated,
    };
  }
}
