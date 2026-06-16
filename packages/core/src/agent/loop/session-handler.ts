/**
 * SessionHandler — session persistence extracted from Base.
 *
 * Manages session lifecycle: creating, saving, restoring sessions,
 * auto-generating titles, and updating UI messages.
 *
 * Part of the mixin chain: MemoryHandler <- SessionHandler <- Base.
 */

import { generateText } from "ai";

import { extractTokenUsage } from "../agent-context/types.js";

import { MemoryHandler } from "./memory-handler.js";

import type { SessionStore } from "../session/session-store.js";
import type { SessionData } from "../session/types.js";
import type { TodoManager } from "../todo-manager";
import type { UIMessage } from "ai";

export class SessionHandler extends MemoryHandler {
  // Session state
  sessionStore: SessionStore | null = null;
  sessionData: SessionData | null = null;
  sessionConfig: { provider: string; model: string } | null = null;

  // Populated by Base
  todoManager: TodoManager | null = null;

  setSessionStore(store: SessionStore, config: { provider: string; model: string }): void {
    this.sessionStore = store;
    this.sessionConfig = config;
  }

  getSessionStore(): SessionStore | null {
    return this.sessionStore;
  }

  setSessionData(data: SessionData): void {
    this.sessionData = data;
  }

  getSessionData(): SessionData | null {
    return this.sessionData;
  }

  /** Lazily create a session on first use. */
  private ensureSession(): void {
    if (this.sessionData || !this.sessionStore || !this.sessionConfig) return;
    const session = this.sessionStore.create({
      provider: this.sessionConfig.provider,
      model: this.sessionConfig.model,
    });
    this.sessionData = session;
  }

  /** Generate a concise session title from the first user message using LLM. */
  private async generateSessionTitle(userMessage: string): Promise<string> {
    if (!this.model) return userMessage.slice(0, 50);
    try {
      const result = await generateText({
        model: this.model,
        maxOutputTokens: 30,
        system:
          "Generate a concise title (3-8 words) for a conversation that starts with the following message. Return ONLY the title, no quotes or punctuation.",
        prompt: userMessage.slice(0, 500),
      });

      if (this.context && result.usage) {
        this.context.addTotalUsage(extractTokenUsage(result.usage));
      }

      return result.text.trim().slice(0, 80) || userMessage.slice(0, 50);
    } catch {
      return userMessage.slice(0, 50);
    }
  }

  /** Persist the current session state to disk (server-side data only). */
  protected saveSession(): void {
    if (!this.sessionStore || !this.context) return;
    if (!this.sessionData) {
      this.ensureSession();
      this.saveSession();
      return;
    }

    const messages = this.context.getMessages();

    this.sessionData.summaryMessage = this.context.getSummaryMessage();
    this.sessionData.compactIndex = this.context.getCompactIndex();
    this.sessionData.usage = this.context.getTotalUsage();
    this.sessionData.cost = this.context.getTotalCost();

    if (this.todoManager) {
      this.sessionData.todos = this.todoManager.getItems();
    }

    // Auto-generate session title from first user message
    if (this.sessionData.name === "New Session") {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) {
        const text =
          typeof firstUser.content === "string"
            ? firstUser.content
            : Array.isArray(firstUser.content)
              ? firstUser.content.find((p) => p.type === "text")?.text || ""
              : "";
        if (typeof text === "string" && text.length > 0) {
          this.generateSessionTitle(text as string).then((title) => {
            if (this.sessionData && this.sessionStore) {
              this.sessionData.name = title;
              this.sessionStore.save(this.sessionData).catch(() => {});
            }
          });
        }
      }
    }

    this.sessionStore.save(this.sessionData).catch((err) => {
      this.log?.warn("agent", "Failed to save session", err);
    });
  }

  /** Update stored UIMessages from the client. */
  updateSessionUIMessages(uiMessages: UIMessage[]): void {
    if (!this.sessionStore) return;
    if (!this.sessionData) {
      this.ensureSession();
      this.updateSessionUIMessages(uiMessages);
      return;
    }
    this.sessionData.uiMessages = uiMessages;
    this.sessionStore.save(this.sessionData).catch((err) => {
      this.log?.warn("agent", "Failed to save session UIMessages", err);
    });
  }
}
