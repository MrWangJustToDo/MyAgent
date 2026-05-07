import { useCallback, useEffect, useRef, useState } from "react";

import { useServerConfig } from "./useServerConfig";

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  percent: number;
}

export function useUsage(isLoading: boolean): UsageInfo {
  const url = useServerConfig((s) => s.url);
  const [usage, setUsage] = useState<UsageInfo>({ inputTokens: 0, outputTokens: 0, totalTokens: 0, percent: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`${url}/api/usage`);
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch {
      // ignore
    }
  }, [url]);

  useEffect(() => {
    fetchUsage();

    if (isLoading) {
      timerRef.current = setInterval(fetchUsage, 2000);
    } else {
      fetchUsage();
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLoading, fetchUsage]);

  return usage;
}
