/**
 * Rebuild TanStack `resumeToolState.approvals` from the session approval table.
 *
 * `onConfig` is shallow-merged, so this composes with compaction `{ messages }`.
 * Pending rows are omitted — they are not resolutions.
 */

import { approvalsToResumeMap } from "../../agent/approval/tool-approval-table.js";

import type { ToolApprovalRecord } from "../../agent/persistence/types.js";
import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ChatMiddleware } from "@tanstack/ai";

export interface ApprovalResumeMiddlewareDeps {
  getApprovals: () => readonly ToolApprovalRecord[];
}

export function createApprovalResumeMiddleware(deps: ApprovalResumeMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "approval-resume",
    onConfig: async (_ctx, config) => {
      const approvals = approvalsToResumeMap(deps.getApprovals());
      if (approvals.size === 0) return;

      return {
        resumeToolState: {
          ...config.resumeToolState,
          approvals,
        },
      };
    },
  };
}
