/**
 * Custom stop conditions for the agentic tool-calling loop.
 *
 * The AI SDK's `stopWhen` accepts an `Arrayable<StopCondition>` — a single
 * condition or an array (OR semantics: the loop stops as soon as any
 * condition returns `true`). The SDK ships three factories:
 *
 *  - `isStepCount(n)`        — stop after `n` steps (hard cap)
 *  - `isLoopFinished()`      — never stop (run until natural termination)
 *  - `hasToolCall(...names)` — stop when a named tool is called
 *
 * `isLoopFinished()` is risky on its own (a looping model burns tokens
 * forever), while a fixed `isStepCount(n)` either truncates complex tasks or
 * forces trivial ones to run to the cap. The condition below gives the best
 * of both: stop as soon as the model naturally finishes (no tool call +
 * `finishReason === "stop"`), with `isStepCount` kept only as a safety net.
 */

import type { StopCondition } from "ai";

/**
 * Stop the loop when the model ends a step without any tool call and with a
 * `stop` finish reason — i.e. the model chose to produce a final text answer
 * instead of calling another tool.
 *
 * In the Vercel AI SDK agentic loop, a step whose `finishReason` is `"stop"`
 * and that contains zero tool calls means the model has decided it is done.
 * Without this condition the loop would keep going until the step-count cap
 * is hit, wasting tokens on no-op iterations.
 *
 * Combine with `isStepCount` as a safety net:
 *
 * ```typescript
 * stopWhen: [isStepCount(50), isNaturalEnd()]
 * ```
 */
export function isNaturalEnd(): StopCondition<any, any> {
  return ({ steps }) => {
    const lastStep = steps[steps.length - 1];
    if (!lastStep) return false;
    // `finishReason === "stop"` means the model returned a final answer
    // (as opposed to "tool-calls", "length", "content-filter", etc.).
    // Requiring zero tool calls guards against providers that report "stop"
    // alongside a tool call in edge cases.
    return lastStep.finishReason === "stop" && (lastStep.toolCalls?.length ?? 0) === 0;
  };
}
