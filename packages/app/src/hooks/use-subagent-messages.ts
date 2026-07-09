import { agentManager } from "@my-agent/core";
import { throttle } from "lodash-es";
import { useEffect, useState } from "react";

import type { UIMessage } from "@tanstack/ai";

function readSubagentMessages(subagentId: string): UIMessage[] {
  return (agentManager.getAgent(subagentId)?.ui?.getMessages() ?? []) as UIMessage[];
}

/**
 * Subscribe to live UIMessage snapshots for a subagent preview.
 */
export function useSubagentMessages(subagentId: string | undefined): UIMessage[] {
  const [messages, setMessages] = useState<UIMessage[]>(() => (subagentId ? readSubagentMessages(subagentId) : []));

  useEffect(() => {
    if (!subagentId) {
      setMessages([]);
      return;
    }

    const refresh = throttle(() => setMessages(readSubagentMessages(subagentId)), 200);
    refresh();

    let unsubChannel: (() => void) | undefined;
    const attachChannel = () => {
      unsubChannel?.();
      unsubChannel = undefined;
      const ui = agentManager.getAgent(subagentId)?.ui;
      if (!ui) return;
      unsubChannel = ui.subscribe(refresh);
      refresh();
    };

    attachChannel();

    const unsubs = [
      agentManager.on("subagent:started", (event) => {
        if (event.agentId !== subagentId) return;
        attachChannel();
      }),
      agentManager.on("subagent:ui-update", (event) => {
        if (event.agentId !== subagentId) return;
        refresh();
      }),
    ];

    return () => {
      unsubChannel?.();
      unsubs.forEach((unsub) => unsub());
    };
  }, [subagentId]);

  return messages;
}
