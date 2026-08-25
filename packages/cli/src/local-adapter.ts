import { agentManager, createLocalAgentSessionHost } from "@my-agent/core";

import type { AdapterHooks, AgentAdapter, AppConfig, ClipboardImageResult, InitResult } from "@my-agent/app";
import type { AgentSessionHost } from "@my-agent/core";

export class LocalAgentAdapter implements AgentAdapter {
  private host: AgentSessionHost | null = null;
  private agentId: string | null = null;
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

  async initialize(config: AppConfig): Promise<InitResult> {
    const { createAgentFromConfig } = await import("@my-agent/app");
    // Session-plane wiring is host-process owned: local manager today, a
    // remote HTTP host (`--remote-session`) can replace this line later.
    const host = createLocalAgentSessionHost({ manager: agentManager });
    const result = await createAgentFromConfig({ config, name: "local-chat", hooks: this._hooks, host });
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
