import { commandJobRegistry, type CompletedCommandJob } from "../../agent/tools/util/command-job-registry.js";

import { injectSyntheticMessages } from "./synthetic-injection.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { AgentUIChannel } from "../../agent/ui-channel.js";
import type { ChatMiddleware, ModelMessage, UIMessage } from "@tanstack/ai";

export interface BackgroundNotificationMiddlewareDeps {
  /** Cap per-notification output length to avoid inflating the prompt. */
  maxOutputChars?: number;
  /** Live access to the UI channel (to persist the synthetic notification). */
  getUIChannel: () => AgentUIChannel | undefined;
  /** Persist the updated UI messages (dehydrate session to disk). */
  persistMessages: (next: UIMessage[]) => void;
}

const OPEN = "<ctx kind=background_notification>";
const CLOSE = "</ctx>";

/**
 * Lightweight completion notification for background jobs.
 *
 * Before each LLM call (including mid-loop iterations), drain the completed-job
 * queue from {@link commandJobRegistry} and append a single synthetic user
 * message listing every newly-finished job. Each job is notified exactly once
 * (registry marks it notified). Kept out of turn-context so a background job
 * finishing does not re-emit the large per-turn context snapshot.
 *
 * The notification is BOTH injected transiently into the current run's messages
 * (so the model sees it mid-loop) AND persisted into the UI channel + session as
 * a small, independent synthetic message (so it survives across turns and keeps
 * the prompt-cache prefix byte-stable). Each notification message carries its own
 * stable id derived from its content hash, so restores never duplicate it.
 *
 * Output is capped per job to avoid inflating the prompt.
 */
export function createBackgroundNotificationMiddleware(
  deps: BackgroundNotificationMiddlewareDeps
): ChatMiddleware<ToolRunContext> {
  const maxOutputChars = deps.maxOutputChars ?? 2000;

  return {
    name: "background-notification",
    onConfig: async (_ctx, config) => {
      const completed = commandJobRegistry.collectCompleted();
      if (completed.length === 0) return {};

      const messages = config.messages as ModelMessage[];
      const ui = deps.getUIChannel();
      if (!ui) {
        // No channel: transient wire-only injection (next projection drops it).
        messages.push({ role: "user", content: formatNotifications(completed, maxOutputChars) });
        return { messages };
      }

      // Shared injection path: content-hash dedupe + channel persistence + wire
      // positioning. Jobs are marked notified by the registry, so each completion
      // reaches this point exactly once. Appended at the end (one-shot semantics).
      injectSyntheticMessages(
        messages,
        [{ kind: "background_notification", content: formatNotifications(completed, maxOutputChars) }],
        { ui, persist: deps.persistMessages }
      );

      return { messages };
    },
  };
}

function formatNotifications(jobs: CompletedCommandJob[], maxOutputChars: number): string {
  const sections = jobs.map((job) => {
    const status = job.status === "exited" ? "completed" : job.status;
    const exit = job.exitCode == null ? "n/a" : String(job.exitCode);
    const body = [`Job ${job.id} finished with status ${status} (exit code ${exit}).`, `Command: ${job.command}`];
    const out = cap(job.stdout, maxOutputChars);
    const err = cap(job.stderr, maxOutputChars);
    if (out) body.push(`stdout:\n${out}`);
    if (err) body.push(`stderr:\n${err}`);
    return body.join("\n");
  });

  return `${OPEN}\n${sections.join("\n\n")}\n${CLOSE}`;
}

function cap(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const kept = text.slice(-max);
  return `[output truncated to last ${max} chars]\n${kept}`;
}
