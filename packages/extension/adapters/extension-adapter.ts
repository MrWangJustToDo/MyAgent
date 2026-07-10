import { clearAdapterHooks, createAgentFromConfig } from "@my-agent/app";
import { agentManager } from "@my-agent/core";

import type { AdapterHooks, AgentAdapter, AppConfig, ClipboardImageResult, InitResult } from "@my-agent/app";
import type { ManagedAgent } from "@my-agent/core";

export class ExtensionAgentAdapter implements AgentAdapter {
  private agent: ManagedAgent | null = null;
  private _hooks: AdapterHooks;

  constructor(options: { hooks: AdapterHooks }) {
    this._hooks = options.hooks;
  }

  async initialize(config: AppConfig): Promise<InitResult> {
    const result = await createAgentFromConfig({ config, name: "extension-chat", hooks: this._hooks });
    this.agent = result.agent as ManagedAgent;
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
