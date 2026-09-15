import { createState } from "reactivity-store";

export const useInit = createState(() => ({ loading: true, error: null as Error | null }), {
  withActions: (s) => ({
    setLoading: (b: boolean) => (s.loading = b),
    setError: (e?: Error | null) => (s.error = e || null),
  }),
  withDeepSelector: false,
  withStableSelector: true,
});
