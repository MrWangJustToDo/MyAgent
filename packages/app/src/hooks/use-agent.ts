import { createState, markRaw } from "reactivity-store";

import type { AgentSession, AgentSessionHost } from "@my-agent/core";

/**
 * Active Session + Host for the UI. No ManagedAgent.
 *
 * Multiple live sessions may coexist in this process. The store tracks a
 * registry of live {@link AgentSession} handles (`sessions`) plus the single
 * *active* session (`session`) that the UI is currently bound to. Switching the
 * active session only flips the pointer — the underlying live agent keeps
 * running (its RunCoordinator / messages / todos are independent).
 *
 * Session/Host are live handles (`subscribe` / `dispatch`). Store them with
 * {@link markRaw} so selectors do not wrap them as readonly proxies.
 */
export const useAgent = createState(
  () => ({
    host: null as AgentSessionHost | null,
    session: null as AgentSession | null,
    /** Live session registry keyed by AgentSession.id (agentId). */
    sessions: {} as Record<string, AgentSession>,
    /** Id of the active session (matches `session.id`). */
    activeSessionId: null as string | null,
  }),
  {
    withActions: (s) => ({
      setHost: (host: AgentSessionHost | null) => {
        s.host = host ? markRaw(host) : null;
      },
      /**
       * Register a live session. Optionally activate it (make it the UI-active
       * session). Same session re-registration is idempotent.
       */
      registerSession: (session: AgentSession, options?: { activate?: boolean }) => {
        const raw = session ? markRaw(session) : null;
        if (!raw) return;
        s.sessions = { ...s.sessions, [raw.id]: raw };
        if (options?.activate) {
          s.session = raw;
          s.activeSessionId = raw.id;
        }
      },
      /** Set the UI-active session to an already-registered live session. */
      activateSession: (sessionId: string) => {
        const raw = s.sessions[sessionId];
        if (!raw) return;
        s.session = raw;
        s.activeSessionId = raw.id;
      },
      /** Remove a session from the registry (e.g. after it is destroyed). */
      removeSession: (sessionId: string) => {
        const next = { ...s.sessions };
        delete next[sessionId];
        s.sessions = next;
        if (s.activeSessionId === sessionId) {
          const remaining = Object.keys(next);
          const fallback = remaining.length ? next[remaining[0]] : null;
          s.session = fallback ? markRaw(fallback) : null;
          s.activeSessionId = fallback ? fallback.id : null;
        }
      },
      /** Back-compat single-session setter — registers and activates. */
      setSession: (session: AgentSession | null) => {
        if (session) {
          const raw = markRaw(session);
          s.sessions = { ...s.sessions, [raw.id]: raw };
          s.session = raw;
          s.activeSessionId = raw.id;
        } else {
          s.session = null;
          s.activeSessionId = null;
          s.sessions = {};
        }
      },
    }),

    withDeepSelector: false,

    withStableSelector: true,
  }
);
