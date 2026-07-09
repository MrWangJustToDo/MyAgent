import type { AgentEventType } from "../../managers/agent-event-bus.js";
import type { AgentStatus } from "../../managers/agent-types.js";
import type { AgentLog } from "../agent-log";
import type { ToolRunContext } from "../runner/run-context.js";
import type { ChatMiddleware, ToolPhaseCompleteInfo } from "@tanstack/ai";

// ============================================================================
// Approval middleware — tool approval status + events (core closed loop)
// ============================================================================

export interface ApprovalMiddlewareDeps {
  getStatus: () => AgentStatus;
  setStatus: (status: AgentStatus) => void;
  setPendingApprovalCount: (count: number) => void;
  log: AgentLog | null;
  emitEvent?: (type: AgentEventType, data?: Record<string, unknown>) => void;
}

function syncWaitingForApprovals(
  deps: ApprovalMiddlewareDeps,
  needsApproval: ToolPhaseCompleteInfo["needsApproval"]
): void {
  const count = needsApproval.length;
  deps.setPendingApprovalCount(count);

  if (count === 0) {
    if (deps.getStatus() === "waiting") {
      deps.setStatus("running");
    }
    return;
  }

  if (deps.getStatus() !== "waiting") {
    deps.setStatus("waiting");
  }

  for (const approval of needsApproval) {
    deps.log?.approval("Tool approval requested", {
      toolCallId: approval.toolCallId,
      toolName: approval.toolName,
      approvalId: approval.approvalId,
    });
    deps.emitEvent?.("agent:tool-approval-request", {
      tool_call_id: approval.toolCallId,
      tool_name: approval.toolName,
      approval_id: approval.approvalId,
      tool_input: approval.input,
    });
  }
}

/**
 * Sets agent status to `waiting` when TanStack reports tools that need user approval.
 * Resumes `running` when an approved tool actually begins execution.
 */
export function createApprovalMiddleware(deps: ApprovalMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "approval",
    onToolPhaseComplete: async (_ctx, info) => {
      syncWaitingForApprovals(deps, info.needsApproval);
    },
    onBeforeToolCall: async () => {
      if (deps.getStatus() === "waiting") {
        deps.setPendingApprovalCount(0);
        deps.setStatus("running");
      }
      return;
    },
  };
}
