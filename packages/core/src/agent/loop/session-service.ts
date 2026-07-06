/**
 * SessionService — session persistence and UI message sync.
 *
 * Composed by Base; no longer part of the class inheritance chain.
 */

import { streamText } from "ai";

import { extractTokenUsage } from "../agent-context/types.js";

import type { AgentLoopHost } from "./agent-loop-host.js";
import type { SessionStore } from "../session/session-store.js";
import type { SessionData } from "../session/types.js";
import type { UIMessage } from "ai";

export class SessionService {
  private store: SessionStore | null = null;
  private data: SessionData | null = null;
  private config: { provider: string; model: string } | null = null;

  constructor(private readonly getHost: () => AgentLoopHost) {}

  setStore(store: SessionStore, config: { provider: string; model: string }): void {
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
      provider: this.config.provider,
      model: this.config.model,
    });
  }

  private async generateSessionTitle(userMessage: string): Promise<string> {
    const { model, context } = this.getHost();
    if (!model) return userMessage.slice(0, 50);
    try {
      const stream = streamText({
        model,
        maxOutputTokens: 30,
        instructions:
          "Generate a concise title (3-8 words) for a conversation that starts with the following message. Return ONLY the title, no quotes or punctuation.",
        prompt: userMessage.slice(0, 500),
      });

      const text = await stream.text;
      const usage = await stream.usage;

      if (context && usage) {
        context.addTotalUsage(extractTokenUsage(usage));
      }

      return text.trim().slice(0, 80) || userMessage.slice(0, 50);
    } catch {
      return userMessage.slice(0, 50);
    }
  }

  saveSession(): void {
    const { log, context, todoManager } = this.getHost();
    if (!this.store || !context) return;
    if (!this.data) {
      this.ensureSession();
      this.saveSession();
      return;
    }

    const messages = context.getMessages();

    this.data.summaryMessage = context.getSummaryMessage();
    this.data.compactIndex = context.getCompactIndex();
    this.data.usage = context.getTotalUsage();
    this.data.cost = context.getTotalCost();
    this.data.contextTokens = context.getUsage().inputTokens;

    if (todoManager) {
      this.data.todos = todoManager.getItems();
    }

    if (this.data.name === "New Session") {
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
            if (this.data && this.store) {
              this.data.name = title;
              this.store.save(this.data).catch(() => {});
            }
          });
        }
      }
    }

    this.store.save(this.data).catch((err) => {
      log?.warn("agent", "Failed to save session", err);
    });
  }

  updateUIMessages(uiMessages: UIMessage[]): void {
    const { log } = this.getHost();
    if (!this.store) return;
    if (!this.data) {
      this.ensureSession();
      this.updateUIMessages(uiMessages);
      return;
    }
    this.data.uiMessages = uiMessages;
    this.store.save(this.data).catch((err) => {
      log?.warn("agent", "Failed to save session UIMessages", err);
    });
  }
}
