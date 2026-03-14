import { useCallback, useEffect, useState } from "react";

import { useAgent } from "./useAgent.js";
import { useAgentContext } from "./useAgentContext.js";

import type { ToolRenderPart } from "@my-agent/core";

// ============================================================================
// Types
// ============================================================================

export type ApprovalDecision = "approve" | "reject" | "pending";

export interface ApprovalState {
  /** All tools pending approval */
  tools: ToolRenderPart[];
  /** Currently selected tool */
  currentTool: ToolRenderPart | null;
  /** Decision for current tool */
  currentDecision: ApprovalDecision;
  /** Whether all tools have decisions (can submit) */
  canSubmit: boolean;
  /** Count of pending decisions */
  pendingCount: number;
  /** Count of approved tools */
  approvedCount: number;
  /** Count of rejected tools */
  rejectedCount: number;
}

export interface ApprovalActions {
  /** Set decision for current tool */
  decide: (decision: ApprovalDecision) => void;
  /** Set decision for all tools */
  decideAll: (decision: ApprovalDecision) => void;
  /** Select next tool */
  selectNext: () => void;
  /** Select previous tool */
  selectPrev: () => void;
  /** Select tool by id */
  selectById: (id: string) => void;
  /** Submit all decisions */
  submit: () => void;
  /** Get decision for a tool */
  getDecision: (toolId: string) => ApprovalDecision;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing tool approval state
 */
export function useApprovalState(): [ApprovalState, ApprovalActions] {
  // Get context
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const tools = useAgentContext((s) => s.context?.getAllPendingApprove() as ToolRenderPart[]) as ToolRenderPart[];

  // Local state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Map<string, ApprovalDecision>>(new Map());

  // Sync state when tools change
  useEffect(() => {
    if (tools.length > 0) {
      // Update decisions map
      setDecisions((prev) => {
        const next = new Map<string, ApprovalDecision>();
        tools.forEach((tool) => {
          next.set(tool.id, prev.get(tool.id) ?? "pending");
        });
        return next;
      });

      // Update selected
      setSelectedId((prev) => {
        if (!prev || !tools.find((t) => t.id === prev)) {
          return tools[0]?.id ?? null;
        }
        return prev;
      });
    }
  }, [tools.length]);

  // Computed values
  const currentTool = tools.find((t) => t.id === selectedId) ?? null;
  const currentDecision = selectedId ? (decisions.get(selectedId) ?? "pending") : "pending";

  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;

  tools.forEach((tool) => {
    const d = decisions.get(tool.id) ?? "pending";
    if (d === "pending") pendingCount++;
    else if (d === "approve") approvedCount++;
    else rejectedCount++;
  });

  const canSubmit = pendingCount === 0 && tools.length > 0;

  // Actions
  const decide = useCallback(
    (decision: ApprovalDecision) => {
      if (!selectedId) return;
      setDecisions((prev) => new Map(prev).set(selectedId, decision));
    },
    [selectedId]
  );

  const decideAll = useCallback(
    (decision: ApprovalDecision) => {
      setDecisions((prev) => {
        const next = new Map(prev);
        tools.forEach((tool) => next.set(tool.id, decision));
        return next;
      });
    },
    [tools]
  );

  const selectNext = useCallback(() => {
    if (!selectedId || tools.length <= 1) return;
    const idx = tools.findIndex((t) => t.id === selectedId);
    if (idx !== -1 && idx < tools.length - 1) {
      setSelectedId(tools[idx + 1]?.id ?? null);
    }
  }, [selectedId, tools]);

  const selectPrev = useCallback(() => {
    if (!selectedId || tools.length <= 1) return;
    const idx = tools.findIndex((t) => t.id === selectedId);
    if (idx > 0) {
      setSelectedId(tools[idx - 1]?.id ?? null);
    }
  }, [selectedId, tools]);

  const selectById = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const submit = useCallback(async () => {
    const context = useAgentContext.getReadonlyState().context;
    const agent = useAgent.getReadonlyState().current;

    if (!context || !agent || !canSubmit) return;

    // Get tools from agent
    const agentTools = agent.getTools();

    // Process all decisions
    for (const tool of tools) {
      const decision = decisions.get(tool.id);
      if (decision === "approve") {
        await context.approveTool(tool.id, agentTools);
      } else if (decision === "reject") {
        context.rejectTool(tool.id, "User denied");
      }
    }

    // Continue the agent loop
    agent.resume();
  }, [canSubmit, tools, decisions]);

  const getDecision = useCallback(
    (toolId: string): ApprovalDecision => {
      return decisions.get(toolId) ?? "pending";
    },
    [decisions]
  );

  return [
    {
      tools,
      currentTool,
      currentDecision,
      canSubmit,
      pendingCount,
      approvedCount,
      rejectedCount,
    },
    {
      decide,
      decideAll,
      selectNext,
      selectPrev,
      selectById,
      submit,
      getDecision,
    },
  ];
}
