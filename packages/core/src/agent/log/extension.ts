/**
 * Built-in log extension — owns log **policy**.
 *
 * The emission seam (`AgentLog`) does level filtering, run stamping, envelope construction and
 * hands the assembled entry to a sink. Everything about *what a log looks like* and *where it
 * goes* is assembled here:
 *
 * - **Sink** — the JSONL file with size rotation (`jsonl-file-sink.ts`).
 * - **Policy** — the event→entry rule table, formatting and payload summarizing, and the
 *   subscription that applies them (`event-log-bridge.ts`).
 *
 * So this module is mostly composition: it is the one place that says "these two halves are one
 * feature", which is what makes logging removable/observable as a unit rather than a behaviour
 * spread across the seam's call sites.
 *
 * Two entry paths, and they are deliberately different mechanisms:
 *
 * 1. **The seam** — `AgentLog.debug/info/warn/error/eventEntry` (the ~69 call sites plus the
 *    `ctx.logger` facade). These pass assembled entries straight through; their routing is decided
 *    at the call site, not by a rule.
 * 2. **The bus** — every observable event, turned into entries by the rule table. This is the
 *    subscription that centralizes lifecycle logging.
 *
 * The seam is a **privileged dependency injection**, not a bus event: a log-entry event would have
 * to be deliverable to this extension, but internal events are withheld from both wildcard delivery
 * and the observation surface, and an event this extension emits to feed itself is exactly the
 * recursion the internal classification exists to prevent. Injection has that property by
 * construction — the sink never emits.
 *
 * Subagents matter for the shape of this module: they have no extension runner (only roots get one,
 * `agent-factory.ts`), yet they write logs to their own file. So the extension exposes a **sink
 * factory** that core binds per `AgentLog` — root and subagent alike — rather than a per-agent
 * extension instance.
 */

import { createAgentEventBus } from "../agent-event-bus";
import { registerExtensionExitFlush } from "../agent-log/lifecycle-guards.js";

import { bridgeTelemetryToAgentLog } from "./event-log-bridge.js";
import { createJsonlFileSink, type LogFileSink } from "./jsonl-file-sink.js";

// Registered with the process-exit guards so a hard exit lands pending batches; see the module note.

import type { AgentEventBus } from "../agent-event-bus";
import type { EventLogPolicy, EventLogResolver } from "./event-log-bridge.js";
import type { AgentLog } from "../agent-log/agent-log.js";
import type { AgentLogFileSinkOptions } from "../agent-log/types.js";

export type { EventLogPolicy, EventLogResolver, EventLogRule } from "./event-log-bridge.js";

export interface LogExtensionOptions {
  /** Bus whose events become entries. Defaults to a fresh root bus (standalone use). */
  bus?: AgentEventBus;
  /** Resolve the log an event belongs to (per-agent routing). */
  resolveLog: EventLogResolver;
  /** Rule overrides; `{ enabled: false }` suppresses event-driven logging entirely. */
  policy?: EventLogPolicy;
}

export interface LogExtension {
  /** The bus this instance consumes. */
  readonly bus: AgentEventBus;
  /**
   * Attach this extension's sink to a log (root or subagent). Returns the detach function.
   *
   * Bind every log the agent writes through — including subagent logs — because a subagent has no
   * extension runner of its own and would otherwise lose its file.
   */
  attachSink(log: AgentLog, options: AgentLogFileSinkOptions): () => void;
  /** Start consuming bus events. Idempotent; a no-op when the policy disables logging. */
  start(): void;
  /** Stop consuming, release the exit-path registration, and detach every sink attached. */
  dispose(): void;
}

/**
 * Create the built-in log extension.
 *
 * Follows the built-in-extension convention (one canonical `createXxxExtension` factory) while
 * remaining a **stream consumer + sink provider** rather than an `ExtensionAPI`: it needs no tools,
 * commands or interceptors, and the seam cannot be a bus subscription (see the module note on the
 * privileged injection).
 */
export function createLogExtension(options: LogExtensionOptions): LogExtension {
  const bus = options.bus ?? createAgentEventBus("root");
  const sinks = new Map<AgentLog, LogFileSink>();
  let unsubscribe: (() => void) | null = null;
  // Process-exit path: the sink owns a flush timer, so a hard exit must land the pending batch
  // itself. Registered on the same guards that flush the active logs, and released with the
  // instance so a disposed extension never runs on `exit`.
  let unregisterExitFlush: (() => void) | null = null;
  let started = false;

  const flushSinksSync = (): void => {
    for (const sink of sinks.values()) sink.flushSync();
  };

  return {
    bus,

    attachSink(log, sinkOptions) {
      // Re-pointing an already-attached log must land the old sink's batch first.
      sinks.get(log)?.detach();
      const sink = createJsonlFileSink(sinkOptions);
      sinks.set(log, sink);
      log.attachSink(sink);
      return () => {
        if (sinks.get(log) !== sink) return; // superseded — nothing of ours to detach
        sinks.delete(log);
        sink.detach();
        log.detachSink();
      };
    },

    start() {
      if (started) return;
      started = true;
      unsubscribe = bridgeTelemetryToAgentLog(bus, options.resolveLog, options.policy);
      unregisterExitFlush = registerExtensionExitFlush(flushSinksSync);
    },

    dispose() {
      unsubscribe?.();
      unsubscribe = null;
      unregisterExitFlush?.();
      unregisterExitFlush = null;
      started = false;
      for (const sink of [...sinks.values()]) sink.detach();
      sinks.clear();
    },
  };
}
