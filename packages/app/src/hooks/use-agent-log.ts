import { createState } from "reactivity-store";

import type { AgentSession, LogEntry } from "@my-agent/core";

const MAX_ENTRIES = 2000;

/**
 * Session-projected log entries (no live AgentLog handle).
 * Subscribe via {@link bindSessionLog} with the Session `log` channel.
 */
export const useAgentLog = createState(
  () => ({
    entries: [] as LogEntry[],
    version: 0,
  }),
  {
    withActions: (s) => ({
      clear: () => {
        s.entries = [];
        s.version += 1;
      },
      append: (entry: LogEntry) => {
        s.entries = [...s.entries, entry].slice(-MAX_ENTRIES);
        s.version += 1;
      },
      /** @deprecated Session-only; no live AgentLog. Kept for clearAdapterHooks. */
      setLog: (_c: unknown) => {
        s.entries = [];
        s.version += 1;
      },
    }),

    withDeepSelector: false,

    withStableSelector: true,
  }
);

/** Opt-in Session `log` channel → store. Returns unsubscribe. */
export function bindSessionLog(session: AgentSession | null): () => void {
  useAgentLog.getActions().clear();
  if (!session) return () => {};
  return session.subscribe(
    (event) => {
      if (event.channel !== "log") return;
      useAgentLog.getActions().append(event.payload);
    },
    { channels: ["log"] }
  );
}
