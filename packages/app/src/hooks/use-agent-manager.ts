import { agentManager } from "@my-agent/core";
import { createState } from "reactivity-store";

export const useAgentManager = createState(() => ({ state: agentManager }), {
  withDeepSelector: false,
  withStableSelector: true,
  withNamespace: "useAgentManager",
});
