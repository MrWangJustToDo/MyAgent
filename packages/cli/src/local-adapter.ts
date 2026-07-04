import { agentManager, DirectChatTransport, toolStreamOnError } from "@my-agent/core";

import type { AdapterHooks, AgentAdapter, AppConfig, ClipboardImageResult, InitResult } from "@my-agent/app";
import type { Agent } from "@my-agent/core";
import type { ChatTransport, UIMessage } from "ai";

export class LocalAgentAdapter implements AgentAdapter {
  private agent: Agent | null = null;
  private _exit: () => void;
  private _readClipboardImage: (() => Promise<ClipboardImageResult | null>) | null;
  private _hooks: AdapterHooks;

  constructor(options: {
    exit: () => void;
    readClipboardImage?: () => Promise<ClipboardImageResult | null>;
    hooks: AdapterHooks;
  }) {
    this._exit = options.exit;
    this._readClipboardImage = options.readClipboardImage ?? null;
    this._hooks = options.hooks;
  }

  createTransport(): ChatTransport<UIMessage> {
    if (!this.agent) throw new Error("Agent not initialized");
    // Surface real tool error messages to the UI and the LLM instead of the
    // AI SDK's generic "An error occurred.". This lets the model see *why* a
    // tool call failed (e.g. a missing required schema field) and correct it
    // on the first retry instead of blindly retrying.
    return new DirectChatTransport({
      agent: this.agent,
      onError: toolStreamOnError,
    }) as ChatTransport<UIMessage>;
  }

  async initialize(config: AppConfig): Promise<InitResult> {
    const { createAgentFromConfig } = await import("@my-agent/app");
    const result = await createAgentFromConfig({ config, name: "local-chat", hooks: this._hooks });
    this.agent = result.agent as Agent;
    return result;
  }

  async destroy(): Promise<void> {
    if (this.agent) {
      agentManager.destroyAgent(this.agent.id);
      this.agent = null;
    }
    const { clearAdapterHooks } = await import("@my-agent/app");
    clearAdapterHooks(this._hooks);
  }

  exit(): void {
    this._exit();
  }

  async readClipboardImage(): Promise<ClipboardImageResult | null> {
    if (this._readClipboardImage) {
      return this._readClipboardImage();
    }
    return null;
  }
}
