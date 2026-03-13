import { createAgent } from "@my-agent/core";
import { createState, markRaw, toRaw } from "reactivity-store";

import type { Agent, AgentConfig } from "@my-agent/core";

// ============================================================================
// Types
// ============================================================================

export interface AgentState {
  /** Map of agent instances by key */
  agents: Record<string, Agent>;
  /** Current active agent */
  current: Agent | null;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: AgentState = {
  agents: {},
  current: null,
};

const noop = () => void 0;

// ============================================================================
// State Hook
// ============================================================================

/**
 * Global agent state hook (zustand-like API from reactivity-store)
 *
 * Manages agent instances. Agent state (status, result, error) lives on the Agent class.
 * Message tracking is handled by Agent.context.
 *
 * State Architecture:
 * - useAgent hook: manages agent instances (agents map, current agent)
 * - Agent class: manages goal state (status, result, error)
 * - AgentContext: manages messages (runs, messages, tools)
 *
 * For CLI:
 * - Header/Footer: reads from agent.status, agent.result, agent.error
 * - Content: reads from agent.context.getCurrentMessages()
 *
 * @example
 * ```typescript
 * // Get or create an agent
 * const { getAgent } = useAgent.getActions();
 * const agent = await getAgent("my-agent", {
 *   model: "gpt-4",
 *   rootPath: "/path/to/project",
 * });
 *
 * // Run a prompt (state is on agent itself)
 * await agent.run({ prompt: "Hello" });
 *
 * // Access state reactively (agent stored in hook, Vue tracks changes)
 * const agent = useAgent((s) => s.current);
 * const status = agent?.status;    // "completed"
 * const result = agent?.result;    // AgentRunResult
 * const messages = agent?.context.getCurrentMessages();
 *
 * // Tool approval (method on agent)
 * agent?.approveToolCall();
 * agent?.rejectToolCall("reason");
 * ```
 */
export const useAgent = createState(() => ({ ...initialState }), {
  withActions: (state) => {
    /**
     * Get or create agent for a given key and config
     */
    const getAgent = async (key: string, config: AgentConfig): Promise<Agent> => {
      // Check if we already have an agent for this key
      const existing = state.agents[key];
      if (existing) {
        state.current = existing;
        return existing;
      }

      const setUpAgentInstance = (i: Agent) => {
        // fix zod with vue proxy error
        return new Proxy(i, {
          get(target, p, receiver) {
            const res = Reflect.get(target, p, receiver);

            const rawRes = toRaw(res);

            if (rawRes && typeof rawRes === "object" && p !== "context") {
              return markRaw(rawRes);
            }

            return res;
          },
        });
      };

      // Create new agent
      const agent = await createAgent({ ...config, setUp: setUpAgentInstance });

      state.agents[key] = agent;
      state.current = agent;

      return agent;
    };

    /**
     * Initialize agent with config
     */
    const initAgent = async (key: string, config: AgentConfig): Promise<Agent | null> => {
      const current = state.current;
      if (current && (current.status === "initializing" || current.status === "running")) {
        return null;
      }

      return await getAgent(key, config);
    };

    /**
     * Set current agent by key
     */
    const setCurrentAgent = (key: string): Agent | null => {
      const agent = state.agents[key];
      if (agent) {
        state.current = agent;
        return agent;
      }
      return null;
    };

    /**
     * Run a prompt on the current agent
     */
    const runPrompt = async (prompt: string) => {
      if (!prompt.trim()) return null;

      const agent = state.current;
      if (!agent) return null;
      if (agent.status === "running" || agent.status === "initializing") return null;

      try {
        return await agent.run({ prompt, stream: true, onToken: noop, onReasoning: noop });
      } catch {
        return null;
      }
    };

    /**
     * Get current agent instance (non-reactive)
     */
    const getCurrentAgent = (): Agent | null => state.current;

    /**
     * Get current agent context (convenience method)
     */
    const getContext = () => {
      const agent = state.current;
      return agent?.context ?? null;
    };

    /**
     * Reset current agent state
     */
    const resetAgent = (): void => {
      const agent = state.current;
      agent?.reset();
    };

    /**
     * Destroy an agent by key
     */
    const destroyAgent = (key: string): void => {
      const agent = state.agents[key];
      if (agent) {
        agent.destroy();
        delete state.agents[key];

        if (state.current === agent) {
          state.current = null;
        }
      }
    };

    /**
     * Destroy current agent
     */
    const destroyCurrent = (): void => {
      const agent = state.current;
      if (agent) {
        // Find key for this agent
        const key = Object.entries(state.agents).find(([, a]) => a === agent)?.[0];
        if (key) {
          destroyAgent(key);
        }
      }
    };

    /**
     * Reset all state and destroy all agents
     */
    const reset = async (): Promise<void> => {
      // Destroy all agents
      for (const key of Object.keys(state.agents)) {
        destroyAgent(key);
      }

      // Reset state
      state.agents = {};
      state.current = null;
    };

    return {
      // Agent management
      getAgent,
      initAgent,
      setCurrentAgent,
      getCurrentAgent,
      getContext,

      // Running
      runPrompt,

      // Reset / destroy
      resetAgent,
      destroyAgent,
      destroyCurrent,
      reset,
    };
  },

  withDeepSelector: false,
  withStableSelector: true,
  withNamespace: "useAgent",
});

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get agent actions (non-reactive)
 */
export const getAgentActions = () => useAgent.getActions();
