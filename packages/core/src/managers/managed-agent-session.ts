/**
 * Session persist / restore helpers for {@link ManagedAgent}.
 */

import { readPlanFileAtRelativePath } from "../agent/plan/plan-store.js";

import type { EmitAgentTelemetryFn } from "./emit-agent-telemetry.js";
import type { SessionPersistInput, SessionService } from "./session-service.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { ToolCompactCache } from "../agent/compaction/tool-compact/tool-compact-cache.js";
import type { SessionSyncTracker } from "../agent/persistence/session-sync-tracker.js";
import type { SessionData } from "../agent/persistence/types.js";
import type { PlanModeController } from "../agent/plan/plan-mode-controller.js";
import type { TodoManager } from "../agent/todo-manager";
import type { AgentUIChannel } from "../agent/ui-channel.js";
import type { TextAdapterConfig } from "../models/adapter-factory.js";
import type { UIMessage as TanStackUIMessage } from "@tanstack/ai";

export interface SessionHost {
  ui?: AgentUIChannel;
  usage: UsageTracker;
  todoManager: TodoManager | null;
  planMode: PlanModeController;
  isAutoModeEnabled: () => boolean;
  setAutoModeEnabled: (enabled: boolean) => void;
  session: SessionService;
  sessionSyncTracker: SessionSyncTracker;
  toolCompactCache: ToolCompactCache;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  emitEvent: EmitAgentTelemetryFn;
  resetAdmittedTurnContext?: () => void;
  /** Drop steer/follow-up queues without clearing the transcript (no-op before initChat). */
  clearQueuedMessages: () => void;
  /** Reconcile approval / ask_user pause from restored UIMessages. */
  syncInteractionStateFromUIMessages: (
    messages: TanStackUIMessage[],
    options?: { whenClear?: "idle" | "running" | "completed" }
  ) => void;
}

export function getSessionPersistInput(host: SessionHost, uiMessages?: TanStackUIMessage[]): SessionPersistInput {
  const planOn = host.planMode.getPhase() !== "off";
  return {
    usage: host.usage,
    todoManager: host.todoManager,
    planMode: host.planMode.getState(),
    // Mutual exclusivity: never persist auto while plan is active.
    autoMode: planOn ? false : host.isAutoModeEnabled(),
    resolveTextAdapter: host.resolveTextAdapter,
    emitEvent: (type, data) => host.emitEvent(type, data),
    uiMessages,
  };
}

export async function saveSessionUIMessages(host: SessionHost, uiMessages: TanStackUIMessage[]): Promise<void> {
  if (uiMessages.length === 0) return;
  await host.session.persistSession(getSessionPersistInput(host, uiMessages));
  host.sessionSyncTracker.markPersisted(uiMessages);
}

export async function persistSessionModelState(host: SessionHost): Promise<void> {
  await host.session.persistSession(getSessionPersistInput(host));
}

export async function restoreManagedSession(host: SessionHost, sessionId: string): Promise<SessionData> {
  host.toolCompactCache.clear();
  const session = await host.session.restoreFromStore(sessionId, {
    usage: host.usage,
    todoManager: host.todoManager,
  });

  const planSnapshot = session.planMode ? { ...session.planMode, steps: [...session.planMode.steps] } : null;
  if (planSnapshot && planSnapshot.phase !== "off" && !planSnapshot.planMarkdown?.trim() && planSnapshot.planFilePath) {
    const markdown = await readPlanFileAtRelativePath(planSnapshot.planFilePath);
    if (markdown?.trim()) {
      planSnapshot.planMarkdown = markdown;
    }
  }
  host.planMode.restoreState(planSnapshot);
  // Mutual exclusivity: plan phase wins over auto on restore.
  const planOn = host.planMode.getPhase() !== "off";
  const wantAuto = Boolean(session.autoMode ?? session.autoApprove);
  host.setAutoModeEnabled(planOn ? false : wantAuto);

  // Hydrate UI channel when present; hosts also apply uiMessages via resume APIs.
  if (host.ui) {
    host.ui.setMessages(session.uiMessages);
  }
  applyRestoredSessionChatState(host, session.uiMessages);
  host.resetAdmittedTurnContext?.();
  host.sessionSyncTracker.reset(session.uiMessages);
  host.emitEvent("session:restore", {
    sessionId,
    messageCount: session.uiMessages.length,
    tokenEstimate: session.contextTokens ?? host.usage.getWindowUsage().inputTokens ?? 0,
    planPhase: host.planMode.getPhase(),
    autoMode: host.isAutoModeEnabled(),
  });
  return session;
}

/**
 * Align mid-session restore with Host.create: drop leftover queues and
 * reconcile approval / client-tool waiting from the restored transcript.
 */
export function applyRestoredSessionChatState(
  host: Pick<SessionHost, "clearQueuedMessages" | "syncInteractionStateFromUIMessages">,
  uiMessages: TanStackUIMessage[]
): void {
  host.clearQueuedMessages();
  host.syncInteractionStateFromUIMessages(uiMessages);
}
