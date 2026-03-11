import { createState } from "reactivity-store";

import type { ToolApprovalResponse, ToolCallInfo } from "@my-agent/core";

// ============================================================================
// Types
// ============================================================================

export type ToolItemState = "pending" | "running" | "success" | "error" | "rejected" | "need-approve";

export interface ToolItem {
  /** Unique tool call ID */
  id: string;
  /** Original tool call info */
  source: ToolCallInfo;
  /** Current state */
  state: ToolItemState;
  /** Approval response (if approved/rejected) */
  approval?: ToolApprovalResponse;
  /** Result (if completed) */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  endedAt?: number;
}

export interface UserToolsState {
  /** All tool calls in current session */
  items: ToolItem[];
  /** Current tool being processed */
  current: ToolItem | null;
  /** Tool call awaiting user approval */
  pendingApproval: ToolItem | null;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: UserToolsState = {
  items: [],
  current: null,
  pendingApproval: null,
};

// ============================================================================
// State Hook
// ============================================================================

/**
 * Global user tools state hook (zustand-like API from reactivity-store)
 *
 * Tracks tool calls, their states, and handles approval workflow.
 *
 * @example
 * ```tsx
 * // Use in components (reactive)
 * const { items, current, pendingApproval } = useUserTools();
 *
 * // Select specific state (reactive, optimized re-renders)
 * const pendingApproval = useUserTools((s) => s.pendingApproval);
 *
 * // Get actions (non-reactive, can call anywhere)
 * const { addTool, startTool, completeTool } = useUserTools.getActions();
 * ```
 */
export const useUserTools = createState(() => ({ ...initialState }), {
  withActions: (state) => {
    /**
     * Find tool by ID
     */
    const findTool = (idOrToolCall: string | ToolCallInfo): ToolItem | undefined => {
      const id = typeof idOrToolCall === "string" ? idOrToolCall : idOrToolCall.toolCallId;
      return state.items.find((item) => item.id === id);
    };

    /**
     * Add a new tool call (when tool execution starts)
     */
    const addTool = (toolCall: ToolCallInfo, needsApproval = false): ToolItem => {
      // Check if already exists
      const existing = findTool(toolCall);
      if (existing) {
        return existing;
      }

      const item: ToolItem = {
        id: toolCall.toolCallId,
        source: toolCall,
        state: needsApproval ? "need-approve" : "pending",
        startedAt: Date.now(),
      };

      state.items = [...state.items, item];
      state.current = item;

      if (needsApproval) {
        state.pendingApproval = item;
      }

      return item;
    };

    /**
     * Mark tool as running
     */
    const startTool = (idOrToolCall: string | ToolCallInfo) => {
      const item = findTool(idOrToolCall);
      if (!item) return;

      item.state = "running";
      state.current = item;
    };

    /**
     * Mark tool as completed successfully
     */
    const completeTool = (idOrToolCall: string | ToolCallInfo, result?: unknown) => {
      const item = findTool(idOrToolCall);
      if (!item) return;

      item.state = "success";
      item.result = result;
      item.endedAt = Date.now();

      if (state.current?.id === item.id) {
        state.current = null;
      }
      if (state.pendingApproval?.id === item.id) {
        state.pendingApproval = null;
      }
    };

    /**
     * Mark tool as failed
     */
    const failTool = (idOrToolCall: string | ToolCallInfo, error: string) => {
      const item = findTool(idOrToolCall);
      if (!item) return;

      item.state = "error";
      item.error = error;
      item.endedAt = Date.now();

      if (state.current?.id === item.id) {
        state.current = null;
      }
      if (state.pendingApproval?.id === item.id) {
        state.pendingApproval = null;
      }
    };

    /**
     * Approve a tool call
     */
    const approveTool = (idOrToolCall: string | ToolCallInfo): ToolApprovalResponse | null => {
      const item = findTool(idOrToolCall);
      if (!item || item.state !== "need-approve") return null;

      const approval: ToolApprovalResponse = {
        toolCallId: item.id,
        approved: true,
      };

      item.approval = approval;
      item.state = "running";

      if (state.pendingApproval?.id === item.id) {
        state.pendingApproval = null;
      }

      return approval;
    };

    /**
     * Reject a tool call
     */
    const rejectTool = (idOrToolCall: string | ToolCallInfo, reason = "User denied"): ToolApprovalResponse | null => {
      const item = findTool(idOrToolCall);
      if (!item || item.state !== "need-approve") return null;

      const approval: ToolApprovalResponse = {
        toolCallId: item.id,
        approved: false,
        reason,
      };

      item.approval = approval;
      item.state = "rejected";
      item.endedAt = Date.now();

      if (state.pendingApproval?.id === item.id) {
        state.pendingApproval = null;
      }
      if (state.current?.id === item.id) {
        state.current = null;
      }

      return approval;
    };

    /**
     * Get active (running) tools
     */
    const getActiveTools = (): ToolItem[] => {
      return state.items.filter((item) => item.state === "running" || item.state === "pending");
    };

    /**
     * Get completed tools
     */
    const getCompletedTools = (): ToolItem[] => {
      return state.items.filter(
        (item) => item.state === "success" || item.state === "error" || item.state === "rejected"
      );
    };

    /**
     * Clear all tools (for new run)
     */
    const clear = () => {
      state.items = [];
      state.current = null;
      state.pendingApproval = null;
    };

    /**
     * Reset to initial state
     */
    const reset = () => {
      state.items = [];
      state.current = null;
      state.pendingApproval = null;
    };

    return {
      findTool,
      addTool,
      startTool,
      completeTool,
      failTool,
      approveTool,
      rejectTool,
      getActiveTools,
      getCompletedTools,
      clear,
      reset,
    };
  },
});

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get tools actions (non-reactive)
 */
export const getToolsActions = () => useUserTools.getActions();
