import { useCallback, useEffect, useState } from "react";

import { useServerConfig } from "./useServerConfig";

export interface SessionMeta {
  id: string;
  name: string;
  version: number;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface ResumeResult {
  uiMessages: unknown[];
  session: SessionMeta;
}

export function useSessions() {
  const url = useServerConfig((s) => s.url);
  const connected = useServerConfig((s) => s.connected);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!connected) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${url}/api/sessions`);
      if (res.ok) {
        setSessions(await res.json());
      }
    } catch {
      // ignore
    }
    setIsLoading(false);
  }, [url, connected]);

  useEffect(() => {
    if (connected) refresh();
  }, [connected, refresh]);

  const resumeSession = async (sessionId: string): Promise<ResumeResult | null> => {
    try {
      const res = await fetch(`${url}/api/sessions/${sessionId}/resume`, { method: "POST" });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  };

  return {
    sessions,
    isLoading,
    refresh,
    resumeSession,
  };
}
