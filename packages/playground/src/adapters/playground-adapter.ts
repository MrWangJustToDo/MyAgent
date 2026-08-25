import { clearAdapterHooks, createAgentFromConfig } from "@my-agent/app";
import { agentManager, createLocalAgentSessionHost } from "@my-agent/core";

import type { AdapterHooks, AgentAdapter, AppConfig, ClipboardImageResult, InitResult } from "@my-agent/app";
import type { AgentSessionHost } from "@my-agent/core";

export class PlaygroundAgentAdapter implements AgentAdapter {
  private host: AgentSessionHost | null = null;
  private agentId: string | null = null;
  private _hooks: AdapterHooks;

  constructor(options: { hooks: AdapterHooks }) {
    this._hooks = options.hooks;
  }

  async initialize(config: AppConfig): Promise<InitResult> {
    // WebContainer host: agent loop runs in-browser against the remote env.
    const host = createLocalAgentSessionHost({ manager: agentManager });
    const result = await createAgentFromConfig({ config, name: "playground-chat", hooks: this._hooks, host });
    this.host = host;
    this.agentId = result.session.id;
    return result;
  }

  async destroy(): Promise<void> {
    if (this.host && this.agentId) {
      await this.host.destroy(this.agentId);
      this.host = null;
      this.agentId = null;
    }
    clearAdapterHooks(this._hooks);
  }

  exit(): void {
    void this.destroy().then(() => {
      window.location.reload();
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
        return { data: btoa(binary), mediaType: imageType };
      }
      return null;
    } catch {
      return null;
    }
  }
}
