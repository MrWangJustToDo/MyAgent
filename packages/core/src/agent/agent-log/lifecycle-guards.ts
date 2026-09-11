// ============================================================================
// Agent Log Lifecycle Guards
// ============================================================================
//
// AgentLog's file sink is asynchronous and batch-flushed (see `attachFileSink`).
// On a crash or a hard `process.exit` the last buffered batch — which is usually
// exactly the error/abort that explains why the process is dying — would be lost.
// These guards close that window:
//
//   1. A registry of the agent logs that currently own a disk sink, so a
//      process-wide handler knows where to write.
//   2. Process-level handlers that record a fatal error into every active log
//      and then flush synchronously before the process goes down.
//   3. A `process.on("exit")` flush so a normal quit also drains the buffer.

import type { AgentLog } from "./agent-log.js";

/**
 * Agent logs with an attached file sink. Managed by the agent lifecycle
 * (`bindSessionLogSink` registers, destroy unregisters), not by callers.
 */
const activeLogs = new Set<AgentLog>();

/** Track a log so crash/exit guards can flush it. Idempotent. */
export function registerActiveAgentLog(log: AgentLog): void {
  activeLogs.add(log);
}

/** Stop tracking a log (agent destroyed). Idempotent. */
export function unregisterActiveAgentLog(log: AgentLog): void {
  activeLogs.delete(log);
}

/**
 * Synchronously flush every tracked log's buffered entries. Never throws — a
 * failing flush must not break the shutdown path.
 */
export function flushActiveAgentLogsSync(): void {
  for (const log of activeLogs) {
    try {
      log.flushSync();
    } catch {
      // Non-fatal: log persistence must never break teardown.
    }
  }
}

/** Minimal structural view of the host `process` — avoids depending on Node types. */
interface ProcessLike {
  on(event: string, listener: (...args: unknown[]) => void): void;
  exit(code?: number): void;
}

let guardsInstalled = false;

/**
 * Install process-level handlers so a crash (or a normal exit) still lands the
 * final buffered log entries — and the fatal error itself — on disk.
 *
 * Registered handlers:
 * - `uncaughtException` / `unhandledRejection`: write the error into every
 *   active log, flush synchronously, reprint to stderr (listeners suppress
 *   Node's default print), then exit(1) to preserve the crash semantics that
 *   exist when no handler is registered.
 * - `exit`: flush synchronously (the only hook that can still write on a hard
 *   `process.exit`).
 *
 * Idempotent, and a no-op in runtimes without a `process` (browser hosts).
 * Hosts that run the agent in-process (CLI / server / im-bridge) should call it
 * once at startup.
 */
export function installAgentLogProcessGuards(): void {
  if (guardsInstalled) return;
  const proc = (globalThis as { process?: ProcessLike }).process;
  if (!proc || typeof proc.on !== "function") return;
  guardsInstalled = true;

  let handlingFatal = false;

  const handleFatal = (kind: string, reason: unknown): void => {
    if (handlingFatal) return;
    handlingFatal = true;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    try {
      // Listeners replace Node's default fatal print, so reproduce it here.
      console.error(`[agent] fatal ${kind}:`);
      console.error(error);
      for (const log of activeLogs) {
        try {
          log.error("system", `Fatal ${kind}`, error, { fatal: true, kind });
        } catch {
          // Non-fatal: keep trying the remaining logs.
        }
      }
      flushActiveAgentLogsSync();
    } finally {
      proc.exit(1);
    }
  };

  proc.on("uncaughtException", (err) => handleFatal("uncaughtException", err));
  proc.on("unhandledRejection", (reason) => handleFatal("unhandledRejection", reason));
  proc.on("exit", () => flushActiveAgentLogsSync());
}
