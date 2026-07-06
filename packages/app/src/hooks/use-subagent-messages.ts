import { agentManager, subagentPreviewStore } from "@my-agent/core";
import { useEffect, useState } from "react";

import type { UIMessage } from "ai";

/**
 * Subscribe to live UIMessage snapshots for a subagent preview.
 */
export function useSubagentMessages(subagentId: string | undefined): UIMessage[] {
  const [messages, setMessages] = useState<UIMessage[]>(() =>
    subagentId ? (subagentPreviewStore.get(subagentId) ?? []) : []
  );

  useEffect(() => {
    if (!subagentId) {
      setMessages([]);
      return;
    }

    const refresh = () => setMessages(subagentPreviewStore.get(subagentId) ?? []);
    refresh();

    const unsubStore = subagentPreviewStore.subscribe(subagentId, refresh);
    const unsubEvent = agentManager.on("subagent:ui-update", (event) => {
      if (event.agentId !== subagentId) return;
      refresh();
    });

    return () => {
      unsubStore();
      unsubEvent();
    };
  }, [subagentId]);

  return messages;
}
