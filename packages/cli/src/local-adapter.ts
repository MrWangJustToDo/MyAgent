import { agentManager, createLocalAgentSessionHost } from "@codent/core";

import type { AgentAdapter, AppConfig, ClipboardImageResult, InitResult } from "@codent/app";
import type { AgentSessionHost } from "@codent/core";

export class LocalAgentAdapter implements AgentAdapter {
  private host: AgentSessionHost | null = null;
  private _exit: () => void;
  private _readClipboardImage: (() => Promise<ClipboardImageResult | null>) | null;

  constructor(options: { exit: () => void; readClipboardImage?: () => Promise<ClipboardImageResult | null> }) {
    this._exit = options.exit;
    this._readClipboardImage = options.readClipboardImage ?? null;
  }

  async initialize(config: AppConfig): Promise<InitResult> {
    const { createAgentFromConfig } = await import("@codent/app");
    // Session-plane wiring is host-process owned: local manager, or a remote
    // HTTP host when --remote-session is configured (agent loop runs server-side).
    const host = config.remoteSession
      ? (await import("@codent/server/client")).createRemoteAgentSessionHost({ baseUrl: config.remoteSession })
      : createLocalAgentSessionHost({ manager: agentManager });
    const result = await createAgentFromConfig({ config, name: "local-chat", host });
    this.host = host;
    return result;
  }

  async destroy(): Promise<void> {
    // Tear down every live agent owned by this host (the bootstrap session plus
    // any additional sessions created via /session new). Iterating host.list()
    // guarantees no live agent leaks on exit, regardless of how many sessions
    // were spawned through the store registry.
    if (this.host) {
      const entries = await this.host.list();
      for (const entry of entries) {
        await this.host.destroy(entry.agentId);
      }
      this.host = null;
    }
    const { clearAgentStore } = await import("@codent/app");
    clearAgentStore();
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
