import { createContext, useContext } from "react";

import type { AgentAdapter } from "../adapter/types.js";

const AdapterContext = createContext<AgentAdapter | null>(null);

export const AdapterProvider = AdapterContext.Provider;

export function useAdapter(): AgentAdapter {
  const adapter = useContext(AdapterContext);
  if (!adapter) {
    throw new Error("useAdapter must be used within an <AdapterProvider>");
  }
  return adapter;
}
