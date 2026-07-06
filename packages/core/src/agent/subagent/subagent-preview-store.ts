/**
 * In-memory store for subagent UIMessage previews (read-only UI bridge).
 */

import type { UIMessage } from "ai";

// ============================================================================
// Store
// ============================================================================

type Listener = () => void;

class SubagentPreviewStore {
  private snapshots = new Map<string, UIMessage[]>();
  private listeners = new Map<string, Set<Listener>>();

  get(subagentId: string): UIMessage[] | undefined {
    return this.snapshots.get(subagentId);
  }

  set(subagentId: string, messages: UIMessage[]): void {
    this.snapshots.set(subagentId, messages);
    this.notify(subagentId);
  }

  subscribe(subagentId: string, listener: Listener): () => void {
    if (!this.listeners.has(subagentId)) {
      this.listeners.set(subagentId, new Set());
    }
    this.listeners.get(subagentId)!.add(listener);

    return () => {
      this.listeners.get(subagentId)?.delete(listener);
    };
  }

  clear(subagentId: string): void {
    this.snapshots.delete(subagentId);
    this.notify(subagentId);
  }

  private notify(subagentId: string): void {
    const set = this.listeners.get(subagentId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener();
      } catch {
        // Ignore listener errors
      }
    }
  }
}

export const subagentPreviewStore = new SubagentPreviewStore();
