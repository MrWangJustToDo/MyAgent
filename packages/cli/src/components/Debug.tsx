import { useAgent } from "../hooks/useAgent";
import { useAgentContext } from "../hooks/useAgentContext";
import { useAgentLog } from "../hooks/useAgentLog";

export const Debug = () => {
  useAgent((s) => s.agent);

  useAgentLog((s) => s.log);

  useAgentContext((s) => s.context);

  return null;
};
