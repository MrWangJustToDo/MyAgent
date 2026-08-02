/**
 * Session persist / restore helpers for {@link ManagedAgent}.
 */

import { readPlanFileAtRelativePath } from "../agent/plan/plan-store.js";

import type { AgentEventType } from "./agent-event-bus.js";
import type { SessionPersistInput, SessionService } from "./session-service.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { AgentContext } from "../agent/agent-context";
import type { ToolCompactCache } from "../agent/compaction/tool-compact/tool-compact-cache.js";
import type { PlanModeController } from "../agent/plan/plan-mode-controller.js";
import type { SessionSyncTracker } from "../agent/session/session-sync-tracker.js";
import type { SessionData } from "../agent/session/types.js";
import type { TodoManager } from "../agent/todo-manager";
import type { TextAdapterConfig } from "../models/adapter-factory.js";
import type { UIMessage as TanStackUIMessage } from "@tanstack/ai";

export interface SessionHost {
  context: AgentContext;
  usage: UsageTracker;
  todoManager: TodoManager | null;
  planMode: PlanModeController;
  isAutoApproveEnabled: () => boolean;
  setAutoApproveEnabled: (enabled: boolean) => void;
  session: SessionService;
  sessionSyncTracker: SessionSyncTracker;
  toolCompactCache: ToolCompactCache;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  emitEvent: (type: AgentEventType, data?: Record<string, unknown>) => void;
  syncContextFromUIMessages: (uiMessages: TanStackUIMessage[]) => void;
}

export function getSessionPersistInput(host: SessionHost, uiMessages?: TanStackUIMessage[]): SessionPersistInput {
  return {
    context: host.context,
    usage: host.usage,
    todoManager: host.todoManager,
    planMode: host.planMode.getState(),
    autoApprove: host.isAutoApproveEnabled(),
    resolveTextAdapter: host.resolveTextAdapter,
    emitEvent: (type, data) => host.emitEvent(type, data),
    uiMessages,
  };
}

export function saveSessionUIMessages(host: SessionHost, uiMessages: TanStackUIMessage[]): void {
  if (uiMessages.length === 0) return;
  host.syncContextFromUIMessages(uiMessages);
  host.session.persistSession(getSessionPersistInput(host, uiMessages));
  host.sessionSyncTracker.markPersisted(uiMessages);
}

export function persistSessionModelState(host: SessionHost): void {
  host.session.persistSession(getSessionPersistInput(host));
}

export async function restoreManagedSession(host: SessionHost, sessionId: string): Promise<SessionData> {
  host.toolCompactCache.clear();
  const session = await host.session.restoreFromStore(sessionId, {
    context: host.context,
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
  host.setAutoApproveEnabled(Boolean(session.autoApprove));

  host.sessionSyncTracker.reset(session.uiMessages);
  host.emitEvent("session:restore", {
    sessionId,
    messageCount: session.uiMessages.length,
    tokenEstimate: session.contextTokens ?? host.usage.getWindowUsage().inputTokens ?? 0,
    planPhase: host.planMode.getPhase(),
    autoApprove: host.isAutoApproveEnabled(),
  });
  return session;
}
