import type { AgentLog } from "../../agent/agent-log";
import type { ChatMiddleware, ChatMiddlewareContext } from "@tanstack/ai";

/**
 * Middleware hooks recorded by {@link instrumentMiddlewareLog}. High-frequency
 * `onChunk` (every streamed chunk) and the nested `sandbox` file hooks are
 * intentionally excluded to avoid log noise.
 */
const LOGGED_HOOK_KEYS = [
  "setup",
  "onConfig",
  "onStructuredOutputConfig",
  "onStart",
  "onIteration",
  "onShouldContinue",
  "onBeforeToolCall",
  "onAfterToolCall",
  "onToolPhaseComplete",
  "onUsage",
  "onFinish",
  "onAbort",
  "onError",
  "onInterruptBoundary",
  "onInterruptResolution",
] as const;

/**
 * Wrap every middleware hook so each invocation is recorded to the agent log
 * (category `hooks`, debug level). Return values are passed through untouched
 * (including async/promise hooks and transformed configs/chunks). Middleware
 * names are preserved via `ChatMiddleware.name` (falls back to `anonymous`).
 */
export function instrumentMiddlewareLog<TContext>(
  middleware: ChatMiddleware<TContext>[],
  log: AgentLog
): ChatMiddleware<TContext>[] {
  return middleware.map((mw) => {
    const name = mw.name ?? "anonymous";
    const wrapped: ChatMiddleware<TContext> = { ...mw };

    for (const hook of LOGGED_HOOK_KEYS) {
      const fn = (mw as unknown as Record<string, unknown>)[hook];
      if (typeof fn !== "function") continue;

      (wrapped as unknown as Record<string, unknown>)[hook] = (
        ctx: ChatMiddlewareContext<TContext>,
        ...rest: unknown[]
      ): unknown => {
        log.debug("hooks", `middleware:${name}:${hook}`, {
          phase: ctx.phase,
          iteration: ctx.iteration,
        });
        return (fn as (...args: unknown[]) => unknown).call(mw, ctx, ...rest);
      };
    }

    return wrapped;
  });
}
