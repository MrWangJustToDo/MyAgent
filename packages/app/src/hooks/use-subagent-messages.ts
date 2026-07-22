import { agentManager } from "@my-agent/core";
import { throttle } from "lodash-es";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";

import type { UIMessage } from "@tanstack/ai";

function readSubagentMessages(subagentId: string): UIMessage[] {
  return (agentManager.getAgent(subagentId)?.ui?.getMessages() ?? []) as UIMessage[];
}

/**
 * Subscribe to live UIMessage snapshots for a subagent preview.
 */
export function useSubagentMessages(subagentId: string | undefined): UIMessage[] {
  const rootAgent = toRaw(useAgent((s) => s.agent));
  const [messages, setMessages] = useState<UIMessage[]>(() => (subagentId ? readSubagentMessages(subagentId) : []));

  useEffect(() => {
    if (!subagentId) {
      setMessages([]);
      return;
    }

    const refresh = throttle(() => setMessages(readSubagentMessages(subagentId)), 200);
    refresh();

    let unsubMessages: (() => void) | undefined;
    const attachMessages = () => {
      unsubMessages?.();
      unsubMessages = undefined;
      const managed = agentManager.getAgent(subagentId);
      if (!managed?.ui) return;
      unsubMessages = managed.observe({
        onMessages: (next) => {
          refresh.cancel();
          setMessages(next);
        },
      });
    };

    attachMessages();

    const unsubs: Array<() => void> = [];
    const managed = agentManager.getAgent(subagentId);
    if (managed) {
      unsubs.push(
        managed.observe({
          events: ["subagent:started", "subagent:ui-update"],
          onEvent: () => {
            attachMessages();
            refresh();
          },
        })
      );
    }

    if (rootAgent) {
      unsubs.push(
        rootAgent.observe({
          events: ["subagent:created", "subagent:started"],
          onEvent: (event) => {
            if (event.agentId !== subagentId) return;
            attachMessages();
            refresh();
          },
        })
      );
    }

    return () => {
      unsubMessages?.();
      unsubs.forEach((unsub) => unsub());
      refresh.cancel();
    };
  }, [subagentId, rootAgent]);

  return messages;
}
