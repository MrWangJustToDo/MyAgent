import { agentManager, sessionForSubagent } from "@my-agent/core";
import { throttle } from "lodash-es";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";

import type { UIMessage } from "@tanstack/ai";

function readSubagentMessages(subagentId: string): UIMessage[] {
  const session = sessionForSubagent(agentManager, subagentId);
  if (session) return session.getSnapshot().messages as UIMessage[];
  return (agentManager.getAgent(subagentId)?.ui?.getMessages() ?? []) as UIMessage[];
}

/**
 * Subscribe to live UIMessage snapshots for a subagent preview via AgentSession.
 */
export function useSubagentMessages(subagentId: string | undefined): UIMessage[] {
  const rootSession = toRaw(useAgent((s) => s.session));
  const [messages, setMessages] = useState<UIMessage[]>(() => (subagentId ? readSubagentMessages(subagentId) : []));

  useEffect(() => {
    if (!subagentId) {
      setMessages([]);
      return;
    }

    const refresh = throttle(() => setMessages(readSubagentMessages(subagentId)), 200);
    refresh();

    let childUnsub: (() => void) | undefined;
    const attachChild = () => {
      childUnsub?.();
      childUnsub = undefined;
      const child = sessionForSubagent(agentManager, subagentId);
      if (!child) return;
      childUnsub = child.subscribe(
        (event) => {
          if (event.channel === "messages") {
            refresh.cancel();
            setMessages(event.payload as UIMessage[]);
            return;
          }
          refresh();
        },
        { channels: ["messages", "state", "lifecycle"] }
      );
    };

    attachChild();

    let rootUnsub: (() => void) | undefined;
    if (rootSession) {
      rootUnsub = rootSession.subscribe(
        (event) => {
          if (event.channel !== "lifecycle") return;
          if (event.payload.agentId !== subagentId) return;
          if (
            event.payload.type === "subagent:created" ||
            event.payload.type === "subagent:started" ||
            event.payload.type === "subagent:ui-update"
          ) {
            attachChild();
            refresh();
          }
        },
        { channels: ["lifecycle"] }
      );
    }

    return () => {
      childUnsub?.();
      rootUnsub?.();
      refresh.cancel();
    };
  }, [subagentId, rootSession]);

  return messages;
}
