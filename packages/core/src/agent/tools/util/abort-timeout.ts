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

/**
 * Enforce a declared deadline around a tool body and hand it a signal that aborts when the
 * deadline elapses.
 *
 * This is the one implementation behind both registration paths
 * (`defineServerTool`'s `timeoutMs` and `ExtensionToolDefinition.timeoutMs`), so a timeout
 * always settles the same way:
 *
 * - **A timeout is a failure, not a cancel.** The deadline aborts via
 *   {@link createTimeoutAbort}, so the reason is `ExecutionError("timeout", …)` and
 *   `isAbortError` does not read it as a user stop.
 * - **The run signal outranks the deadline.** The run signal is consulted before the deadline
 *   verdict: once `options.signal` is aborted the call rejects as a cancel even if the timer
 *   also fired (classification is signal-first, mirroring `isAbortError`).
 * - **Race, not just a signal.** A body that ignores its signal is still bounded, because the
 *   operation races the deadline rather than relying on the tool to observe it.
 *
 * `timeoutMessage` lets a caller name the budget in the failure (an extension tool names
 * itself); otherwise the shared `Request timed out after Nms` wording is used.
 */
export async function withTimeoutAbort<T>(
  operation: (signal: AbortSignal) => Promise<T> | T,
  options: { timeoutMs: number; signal?: AbortSignal; timeoutMessage?: string }
): Promise<T> {
  const { controller, cleanup } = createTimeoutAbort(options);
  const runSignal = options.signal;

  const reasonFor = (): unknown => {
    // A run abort (whichever fired first) is always a cancel — never the deadline error.
    if (runSignal?.aborted) return runSignal.reason ?? new Error("aborted");
    const reason = controller.signal.reason;
    if (options.timeoutMessage && reason instanceof ExecutionError && reason.code === "timeout") {
      return new ExecutionError("timeout", options.timeoutMessage);
    }
    return reason ?? new Error("aborted");
  };

  try {
    return await Promise.race([
      Promise.resolve(operation(controller.signal)),
      new Promise<never>((_resolve, reject) => {
        const onAbort = () => reject(reasonFor());
        if (controller.signal.aborted) {
          onAbort();
        } else {
          controller.signal.addEventListener("abort", onAbort, { once: true });
        }
      }),
    ]);
  } finally {
    cleanup();
  }
}
