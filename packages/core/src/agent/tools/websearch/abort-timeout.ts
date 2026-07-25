/**
 * Link an optional external AbortSignal + timeout to a single AbortController.
 * Always pass {@link AbortController.signal} to fetch.
 */

export function createTimeoutAbort(options: { timeoutMs: number; signal?: AbortSignal }): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  const onAbort = () => controller.abort();
  const external = options.signal;
  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    controller,
    cleanup: () => {
      clearTimeout(timeoutId);
      external?.removeEventListener("abort", onAbort);
    },
  };
}
