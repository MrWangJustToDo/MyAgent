import { createAgent } from "@my-agent/core";
import { useEffect, useMemo } from "react";
import { createState, toRaw } from "reactivity-store";

import { useArgs } from "./useArgs";
import { useUserTools } from "./useUserTools";

import type { Agent, AgentRunResult, AgentStepInfo, ToolCallInfo, ToolApprovalResponse } from "@my-agent/core";

// ============================================================================
// Types
// ============================================================================

export type AgentStatus = "idle" | "initializing" | "running" | "waiting_approval" | "completed" | "error";

export interface AgentState {
  /** Map of agent instances by key */
  agents: Record<string, Agent>;
  /** Current active agent */
  current: Agent | null;
  /** Current status */
  status: AgentStatus;
  /** Error message if any */
  error: string;
  /** Current streaming response */
  currentResponse: string;
  /** Current streaming reasoning */
  currentReasoning: string;
  /** Completed steps */
  steps: AgentStepInfo[];
  /** Current step number */
  currentStep: number;
  /** Run result */
  result: AgentRunResult | null;
  /** Active tool calls (in progress) */
  activeToolCalls: ToolCallInfo[];
  /** Completed tool calls */
  completedToolCalls: ToolCallInfo[];
  /** Pending approval info */
  pendingApproval: {
    toolCall: ToolCallInfo;
    resolve: (approved: boolean, reason?: string) => void;
  } | null;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: AgentState = {
  agents: {},
  current: null,
  status: "idle",
  error: "",
  currentResponse: "",
  currentReasoning: "",
  steps: [],
  currentStep: 0,
  result: null,
  activeToolCalls: [],
  completedToolCalls: [],
  pendingApproval: null,
};

// ============================================================================
// State Hook
// ============================================================================

/**
 * Global agent state hook (zustand-like API from reactivity-store)
 *
 * @example
 * ```tsx
 * // Initialize agent (typically in useEffect)
 * const { initAgent } = useAgent.getActions();
 * await initAgent();
 *
 * // Use in components (reactive)
 * const { status, currentResponse } = useAgent();
 *
 * // Select specific state (reactive, optimized re-renders)
 * const status = useAgent((s) => s.status);
 *
 * // Get actions (non-reactive, can call anywhere)
 * const { runPrompt, approveToolCall, rejectToolCall } = useAgent.getActions();
 *
 * // Auto-sync agent with config changes
 * useAgent.getActions().useAutoAgent();
 * ```
 */
export const useAgent = createState(() => ({ ...initialState }), {
  withActions: (state) => {
    /**
     * Get or create agent for current config
     */
    const getOrCreateAgent = async (): Promise<Agent> => {
      const { config, key } = useArgs.getReadonlyState();

      // Check if we already have an agent for this config
      const existing = state.agents[key];
      if (existing) {
        state.current = existing;
        return existing;
      }

      // Create new agent
      const agent = await createAgent({
        model: config.model,
        baseURL: `${config.url}/v1/`,
        systemPrompt: config.systemPrompt,
        rootPath: config.rootPath,
        maxSteps: config.maxSteps,
      });

      state.agents[key] = agent;
      state.current = agent;
      return agent;
    };

    /**
     * Initialize agent
     */
    const initAgent = async () => {
      if (state.status === "initializing" || state.status === "running") return;

      state.status = "initializing";
      state.error = "";

      try {
        await getOrCreateAgent();
        state.status = "idle";
      } catch (err) {
        state.error = `Failed to initialize agent: ${(err as Error).message}`;
        state.status = "error";
      }
    };

    /**
     * Run a prompt
     */
    const runPrompt = async (prompt: string) => {
      if (!prompt.trim()) return;
      if (state.status === "running" || state.status === "initializing") return;

      const agent = toRaw(state.current);
      if (!agent) {
        state.error = "Agent not initialized";
        state.status = "error";
        return;
      }

      // Reset state for new run
      state.status = "running";
      state.currentResponse = "";
      state.currentReasoning = "";
      state.steps = [];
      state.currentStep = 0;
      state.error = "";
      state.result = null;
      state.activeToolCalls = [];
      state.completedToolCalls = [];
      state.pendingApproval = null;

      try {
        const runResult = await agent.run({
          prompt,
          stream: true,
          onToken: (token) => {
            state.currentResponse += token;
          },
          onReasoning: (token) => {
            state.currentReasoning += token;
          },
          onStepStart: (stepNumber) => {
            state.currentStep = stepNumber;
          },
          onStepFinish: (step) => {
            state.steps = [...state.steps, step];
            // Clear streaming content when step finishes
            state.currentResponse = "";
            state.currentReasoning = "";
            state.activeToolCalls = [];
            state.completedToolCalls = [];
          },
          onToolApproval: async (toolCall) => {
            return new Promise<ToolApprovalResponse>((resolve) => {
              state.pendingApproval = {
                toolCall,
                resolve: (approved, reason) => {
                  state.pendingApproval = null;
                  state.status = "running";
                  resolve({
                    toolCallId: toolCall.toolCallId,
                    approved,
                    reason,
                  });
                },
              };
              state.status = "waiting_approval";
            });
          },
          onToolCallStart: (toolCall) => {
            state.activeToolCalls = [...state.activeToolCalls, toolCall];
            useUserTools.getActions().addTool(toolCall);
          },
          onToolCallFinish: (toolCall) => {
            state.activeToolCalls = state.activeToolCalls.filter((tc) => tc.toolCallId !== toolCall.toolCallId);
            state.completedToolCalls = [...state.completedToolCalls, toolCall];
            useUserTools.getActions().completeTool(toolCall);
          },
          onError: (err) => {
            state.error = err.message;
            state.status = "error";
          },
        });

        state.result = runResult;
        state.status = "completed";
      } catch (err) {
        state.error = (err as Error).message;
        state.status = "error";
      }
    };

    /**
     * Approve pending tool call
     */
    const approveToolCall = () => {
      const pending = state.pendingApproval;
      if (!pending) return;
      pending.resolve(true);
    };

    /**
     * Reject pending tool call
     */
    const rejectToolCall = (reason = "User denied the operation") => {
      const pending = state.pendingApproval;
      if (!pending) return;
      pending.resolve(false, reason);
    };

    /**
     * Get current agent instance (non-reactive)
     */
    const getCurrentAgent = (): Agent | null => toRaw(state.current);

    /**
     * Reset state
     */
    const reset = () => {
      state.status = "idle";
      state.error = "";
      state.currentResponse = "";
      state.currentReasoning = "";
      state.steps = [];
      state.currentStep = 0;
      state.result = null;
      state.activeToolCalls = [];
      state.completedToolCalls = [];
      state.pendingApproval = null;
    };

    /**
     * Destroy current agent and cleanup
     */
    const destroy = () => {
      const agent = toRaw(state.current);
      if (agent) {
        agent.destroy();
      }
      state.current = null;
      reset();
    };

    /**
     * Hook to auto-sync agent with config changes
     * Call this in your main component
     */
    const useAutoAgent = () => {
      const key = useArgs.useShallowStableSelector((s) => s.key);

      // When key changes, update current agent
      useMemo(() => {
        if (!key) {
          state.current = null;
          return;
        }

        const existing = state.agents[key];
        if (existing) {
          state.current = existing;
        } else {
          state.current = null;
        }
      }, [key]);

      // Initialize agent when config changes
      useEffect(() => {
        if (key && !state.current) {
          initAgent();
        }
      }, [key]);
    };

    return {
      initAgent,
      runPrompt,
      approveToolCall,
      rejectToolCall,
      getCurrentAgent,
      reset,
      destroy,
      useAutoAgent,
    };
  },
});

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get agent actions (non-reactive)
 */
export const getAgentActions = () => useAgent.getActions();
