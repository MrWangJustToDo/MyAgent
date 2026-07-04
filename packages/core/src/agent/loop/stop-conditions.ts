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
 * forces trivial ones to run to the cap. The conditions below give the best
 * of both: stop as soon as the model naturally finishes (no tool call +
 * `finishReason === "stop"`), or as soon as it stalls (many consecutive
 * tool-only steps with no textual progress), with `isStepCount` kept only
 * as a safety net.
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

/**
 * Default number of consecutive unproductive steps before the loop is
 * considered stalled. Chosen to be lenient enough that legitimate
 * multi-file exploration (e.g. reading 5-6 files in a row before
 * synthesising an answer) is not cut short, while still catching runaway
 * loops that produce no textual progress for an extended run.
 */
export const STALL_DEFAULT_WINDOW = 8;

/**
 * Maximum text length (in characters) a step may produce while still being
 * considered "unproductive". Steps that emit more text than this are
 * treated as meaningful progress and reset the stall counter. The value is
 * intentionally small: a step that only calls a tool and emits a one-line
 * acknowledgement ("Let me check the next file.") is not real progress
 * toward a final answer, whereas a paragraph of analysis is.
 */
export const STALL_DEFAULT_MIN_TEXT_LENGTH = 80;

/**
 * Stop the loop when the model stalls — i.e. it produces many consecutive
 * steps that make no textual progress (each step only calls tools and emits
 * little or no text), without ever reaching a natural end.
 *
 * This catches runaway exploration loops where the model keeps calling tools
 * (e.g. repeated grep/read on similar targets) without synthesising an
 * answer, which would otherwise burn tokens until the step-count cap.
 *
 * A step counts as "productive" if it either:
 *  - reaches a natural end (`finishReason === "stop"` with no tool calls), or
 *  - produces meaningful text (longer than `minTextLength` chars).
 * Any productive step resets the streak. The loop stops once `windowSize`
 * consecutive unproductive steps have accumulated.
 *
 * @param windowSize     - consecutive unproductive steps required to stop.
 * @param minTextLength  - text length below which a step is "unproductive".
 */
export function isStalled(
  windowSize: number = STALL_DEFAULT_WINDOW,
  minTextLength: number = STALL_DEFAULT_MIN_TEXT_LENGTH
): StopCondition<any, any> {
  return ({ steps }) => {
    if (steps.length < windowSize) return false;

    // Examine only the trailing `windowSize` steps.
    const recent = steps.slice(steps.length - windowSize);
    for (const step of recent) {
      // A natural-end step is productive — don't stall on it. (isNaturalEnd
      // will stop the loop separately; this guard keeps the two conditions
      // from interfering.)
      if (step.finishReason === "stop" && (step.toolCalls?.length ?? 0) === 0) {
        return false;
      }
      // Meaningful textual output counts as progress.
      if ((step.text?.trim().length ?? 0) > minTextLength) {
        return false;
      }
    }

    // All recent steps were tool-only with negligible text → stalled.
    return true;
  };
}
