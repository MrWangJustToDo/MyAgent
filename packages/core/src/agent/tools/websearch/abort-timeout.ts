/**
 * Link an optional external AbortSignal + timeout to a single AbortController.
 * Always pass {@link AbortController.signal} to fetch.
 *
 * The timeout aborts with an `ExecutionError("timeout")` REASON rather than a bare
 * `controller.abort()`. Without a reason, `fetch` rejects with the platform default
 * (`DOMException` named `AbortError`), and `isAbortError` accepts that by `name` alone —
 * so a pure timeout settled as "cancelled by user" and the model was told
 * `[Search cancelled by user.] <query>` for a search nobody stopped. A reason makes the
 * local producer say what actually happened, matching the shape CoreEnv's exec contract
 * already uses for `run_command` timeouts.
 */

import { ExecutionError } from "../../../env-types.js";

export function createTimeoutAbort(options: { timeoutMs: number; signal?: AbortSignal }): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new ExecutionError("timeout", `Request timed out after ${options.timeoutMs}ms`)),
    options.timeoutMs
  );

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
