/**
 * Single source of truth for agent status transitions.
 *
 * Stream lifecycle, compaction, approvals, client-tool pauses, and post-run
 * reconciliation all flow through this controller. {@link createStatusMiddleware}
 * is the only runtime hook surface; app code calls the reconcile helpers on
 * {@link ManagedAgent}.
 */

import {
  countPendingToolApprovals,
  hasPendingAskUser,
  needsAgentResponseAfterTools,
  needsToolPhaseContinue,
} from "../agent/run-helpers/tool-phase-utils.js";

import {
  whenClearForReconcilePolicy,
  type AgentRunOutcome,
  type StatusReconcilePolicy,
  type WhenClearStatus,
} from "./agent-run-outcome.js";
import { isTerminalStatus, resolveFinishStatus } from "../runtime-types/agent-status.js";

import type { AgentStatus } from "./agent-types.js";
import type { EmitAgentTelemetryFn } from "./emit-agent-telemetry.js";
import type { StreamChunk, ToolPhaseCompleteInfo, UIMessage } from "@tanstack/ai";

export type { AgentRunOutcome, AgentRunOutcomeKind, AgentRunPath, StatusReconcilePolicy } from "./agent-run-outcome.js";

// ============================================================================
// Types
// ============================================================================

export interface AgentStatusControllerDeps {
  getStatus: () => AgentStatus;
  setStatus: (status: AgentStatus) => void;
  getError: () => string;
  setError: (error: string) => void;
  setPendingApprovalCount: (count: number) => void;
  emitEvent?: EmitAgentTelemetryFn;
}

export interface ReconcileFromUIMessagesOptions {
  whenClear?: WhenClearStatus;
}

// ============================================================================
// Stream chunk → status
// ============================================================================

function applyChunkStatus(getStatus: () => AgentStatus, setStatus: (s: AgentStatus) => void, chunk: StreamChunk): void {
  const type = chunk.type;
  const current = getStatus();

  // Keep interactive pauses and user cancel sticky — leftover chunks must not resurrect "running".
  if (current === "waiting" || current === "awaiting_user" || current === "aborted") return;

  if (type === "TOOL_CALL_START") {
    setStatus("running");
    return;
  }

  if (type === "REASONING_MESSAGE_CONTENT" || type === "REASONING_MESSAGE_START") {
    setStatus("thinking");
    return;
  }

  if (type === "TEXT_MESSAGE_CONTENT") {
    if (current === "running" || current === "thinking") {
      setStatus("responding");
    }
  }
}

// ============================================================================
// AgentStatusController
// ============================================================================

export class AgentStatusController {
  private readonly deps: AgentStatusControllerDeps;

  constructor(deps: AgentStatusControllerDeps) {
    this.deps = deps;
  }

  /** Bridge the gap before TanStack `onStart` during {@link AgentChatController} pump. */
  prepareRunPhase(messages: UIMessage[]): void {
    if (countPendingToolApprovals(messages) > 0) return;

    const status = this.deps.getStatus();
    if (status === "awaiting_user") return;
    if (
      status === "waiting" ||
      status === "idle" ||
      status === "completed" ||
      status === "error" ||
      status === "aborted"
    ) {
      this.deps.setStatus("running");
    }
  }

  onRunStart(): void {
    const status = this.deps.getStatus();
    if (status === "aborted") return;
    if (status !== "waiting" && status !== "awaiting_user") {
      this.deps.setStatus("running");
    }
    this.deps.setError("");
  }

  onStreamChunk(chunk: StreamChunk): StreamChunk {
    applyChunkStatus(this.deps.getStatus, this.deps.setStatus, chunk);
    return chunk;
  }

  onRunFinish(finishReason?: string | null): void {
    void finishReason;
    this.deps.setStatus(resolveFinishStatus(this.deps.getStatus(), this.deps.getError()));
  }

  onRunAbort(): void {
    this.deps.setStatus("aborted");
  }

  onRunError(message: string): void {
    this.deps.setError(message);
    this.deps.setStatus("error");
    this.deps.emitEvent?.("agent:stream-error", { error: message });
  }

  /**
   * Clear error status while waiting to retry a recoverable stream failure.
   * Keeps the panel on `running` during backoff instead of lingering on `error`.
   */
  onRecoveryRetry(): void {
    this.deps.setError("");
    if (this.deps.getStatus() === "error") {
      this.deps.setStatus("running");
    }
  }

  onExternalError(message: string, isAbort: boolean): void {
    this.deps.setError(message);
    if (!isAbort) {
      this.deps.setStatus("error");
    }
  }

  onUserCancel(): void {
    const status = this.deps.getStatus();
    if (status === "running" || status === "thinking" || status === "responding" || status === "compacting") {
      this.deps.setStatus("aborted");
    }
  }

  beginCompaction(
    kind: "auto" | "reactive" = "auto",
    data?: { retry?: number; maxRetries?: number; tokensBefore?: number }
  ): void {
    this.deps.setStatus("compacting");
    if (kind === "reactive") {
      this.deps.emitEvent?.("compaction:reactive-start", data);
    } else {
      this.deps.emitEvent?.("compaction:auto-start", data);
    }
  }

  endCompaction(): void {
    const status = this.deps.getStatus();
    if (status === "compacting") {
      this.deps.setStatus("running");
    }
  }

  syncApprovals(needsApproval: ToolPhaseCompleteInfo["needsApproval"]): void {
    const count = needsApproval.length;
    this.deps.setPendingApprovalCount(count);

    if (count === 0) {
      if (this.deps.getStatus() === "waiting") {
        this.deps.setStatus("running");
      }
      return;
    }

    if (this.deps.getStatus() !== "waiting") {
      this.deps.setStatus("waiting");
    }

    for (const approval of needsApproval) {
      this.deps.emitEvent?.("agent:tool-approval-request", {
        tool_call_id: approval.toolCallId,
        tool_name: approval.toolName,
        approval_id: approval.approvalId,
        tool_input: approval.input,
      });
    }
  }

  onBeforeToolCall(): void {
    if (this.deps.getStatus() === "waiting") {
      this.deps.setPendingApprovalCount(0);
      this.deps.setStatus("running");
    }
  }

  setClientToolWaiting(active: boolean): void {
    if (active) {
      if (this.deps.getStatus() !== "waiting") {
        this.deps.setStatus("awaiting_user");
      }
      return;
    }
    if (this.deps.getStatus() === "awaiting_user") {
      this.deps.setStatus("completed");
    }
  }

  resetToIdle(): void {
    this.deps.setError("");
    this.deps.setStatus("idle");
  }

  reconcileFromUIMessages(messages: UIMessage[], options?: ReconcileFromUIMessagesOptions): void {
    const whenClear = options?.whenClear ?? "idle";
    const pendingCount = countPendingToolApprovals(messages);
    this.deps.setPendingApprovalCount(pendingCount);

    if (pendingCount > 0) {
      this.deps.setStatus("waiting");
      return;
    }
    if (hasPendingAskUser(messages)) {
      this.deps.setStatus("awaiting_user");
      return;
    }
    if (this.deps.getStatus() === "waiting" || this.deps.getStatus() === "awaiting_user") {
      this.deps.setStatus(whenClear);
    }
  }

  /** Mid-run / resume reconcile using a named policy instead of raw `whenClear` literals. */
  reconcileWithPolicy(messages: UIMessage[], policy: StatusReconcilePolicy): void {
    this.reconcileFromUIMessages(messages, { whenClear: whenClearForReconcilePolicy(policy) });
  }

  /**
   * Reconcile status after a chat pump finishes.
   *
   * TanStack `chat()` may end the AG-UI stream while `toolPhase === "wait"` —
   * lifecycle `onFinish` never runs and status can remain `running`.
   */
  reconcileAfterRun(messages: UIMessage[]): void {
    this.reconcileFromUIMessages(messages, { whenClear: "completed" });

    const status = this.deps.getStatus();
    if (status === "waiting" || status === "awaiting_user") return;
    if (needsToolPhaseContinue(messages)) return;
    if (needsAgentResponseAfterTools(messages)) return;
    if (isTerminalStatus(status)) return;

    if (status === "running" || status === "thinking" || status === "responding" || status === "compacting") {
      this.deps.setStatus(this.deps.getError() ? "error" : "completed");
    }
  }

  /**
   * Single entry for end-of-run status finalization (chat pump and detached/subagent).
   *
   * Prefer this over calling {@link reconcileAfterRun} / legacy detached helpers directly.
   */
  applyRunOutcome(outcome: AgentRunOutcome): void {
    const path = outcome.path ?? "chat";
    const { kind, messages } = outcome;

    // Keep approval badge in sync even when we take a terminal shortcut (error/abort).
    this.deps.setPendingApprovalCount(countPendingToolApprovals(messages));

    if (kind === "aborted") {
      this.onRunAbort();
      return;
    }

    if (kind === "error") {
      // executeStream may already have called onRunError — do not re-emit agent:stream-error.
      if (this.deps.getStatus() !== "error") {
        if (outcome.errorMessage) {
          this.onRunError(outcome.errorMessage);
        } else {
          this.deps.setStatus("error");
        }
      } else if (outcome.errorMessage && !this.deps.getError()) {
        this.deps.setError(outcome.errorMessage);
      }
      return;
    }

    if (kind === "waiting") {
      // Pending approval / ask_user: reconcile sets waiting|awaiting_user from messages.
      // whenClear only matters if messages no longer require a wait (should not happen for this kind).
      this.reconcileWithPolicy(messages, path === "detached" ? "after-chat-run" : "during-run");
      if (path === "detached") {
        this.forceDetachedTerminal();
      }
      return;
    }

    // finished
    this.reconcileAfterRun(messages);
    if (path === "detached") {
      this.forceDetachedTerminal();
    }
  }

  private forceDetachedTerminal(): void {
    const status = this.deps.getStatus();
    if (status === "waiting" || status === "awaiting_user") {
      // Subagent run is over — do not linger as "active" for the task panel.
      this.deps.setStatus(this.deps.getError() ? "error" : "completed");
      return;
    }
    if (isTerminalStatus(status) || status === "completed" || status === "idle") return;

    if (status === "running" || status === "thinking" || status === "responding" || status === "compacting") {
      this.deps.setStatus(this.deps.getError() ? "error" : "completed");
    }
  }
}

export function createAgentStatusController(deps: AgentStatusControllerDeps): AgentStatusController {
  return new AgentStatusController(deps);
}
