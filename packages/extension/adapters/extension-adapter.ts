import { clearAdapterHooks, createAgentFromConfig } from "@my-agent/app";
import { agentManager, DirectChatTransport, toolStreamOnError } from "@my-agent/core";

import type { AdapterHooks, AgentAdapter, AppConfig, ClipboardImageResult, InitResult } from "@my-agent/app";
import type { Agent } from "@my-agent/core";
import type { ChatTransport, UIMessage } from "ai";

export class ExtensionAgentAdapter implements AgentAdapter {
  private agent: Agent | null = null;
  private _hooks: AdapterHooks;

  constructor(options: { hooks: AdapterHooks }) {
    this._hooks = options.hooks;
  }

  createTransport(): ChatTransport<UIMessage> {
    if (!this.agent) throw new Error("Agent not initialized");
    return new DirectChatTransport({
      agent: this.agent,
      onError: toolStreamOnError,
    }) as ChatTransport<UIMessage>;
  }

  async initialize(config: AppConfig): Promise<InitResult> {
    const result = await createAgentFromConfig({ config, name: "extension-chat", hooks: this._hooks });
    this.agent = result.agent as Agent;
    return result;
  }

  async destroy(): Promise<void> {
    if (this.agent) {
      agentManager.destroyAgent(this.agent.id);
      this.agent = null;
    }
    clearAdapterHooks(this._hooks);
  }

  exit(): void {
    this.destroy().then(() => {
      try {
        window.close();
      } catch {
        window.location.reload();
      }
    });
  }

  async readClipboardImage(): Promise<ClipboardImageResult | null> {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const data = btoa(binary);
        return { data, mediaType: imageType };
      }
      return null;
    } catch {
      return null;
    }
  }
}
