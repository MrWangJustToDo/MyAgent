/**
 * Output-token floors for the lightweight side queries.
 *
 * Every side query runs through `runSideTextQuery` with a cap the caller picks to match its
 * job: a session title is a handful of words, a PR summary is a paragraph. Those caps are
 * deliberately small, and that is exactly the problem — they are **thinking-blind**.
 *
 * ## Why a small cap silently produces nothing
 *
 * On a reasoning model, thinking is emitted first and **cannot be dropped**: the model thinks,
 * then answers. Thinking tokens count against the same `max_tokens` budget, so a cap sized for
 * the *answer* is consumed entirely by the *reasoning* and the stream ends with
 * `stop_reason: "max_tokens"` and zero text.
 *
 * This is how session-title generation silently degraded for every turn against a reasoning
 * model served over the Anthropic surface — the caller's `maxOutputTokens: 30` was exhausted by
 * thinking, the port raised "The response was cut off because the maximum token limit was
 * reached", `generateSessionTitle`'s catch fell back to `userMessage.slice(0, 50)`, and a
 * truncated first message looks exactly like a normal title. Nothing pointed at the request.
 *
 * ## Where the number comes from
 *
 * Measured against `zhipu/glm-5.3-flash` (a reasoning model whose endpoint **rejects** the
 * `thinking` disable, so it always takes the thinking path), title-shaped prompt, 4 runs each:
 *
 * | `max_tokens` | produced a title |
 * |--------------|------------------|
 * | 256          | 1/4              |
 * | 512          | 3/4              |
 * | 1024         | 4/4              |
 *
 * Thinking length varies run to run, so the budget has to be a multiple of the job rather than
 * "a bit more than the job" — 512 is close enough to the observed thinking length to fail a
 * quarter of the time. `1024` is also the floor Anthropic itself uses for
 * `thinking.budget_tokens` (the TanStack adapter's `validateThinking` rejects anything lower),
 * so it is the smallest value the ecosystem treats as "enough room to think at all".
 *
 * ## What this does and does not fix
 *
 * It fixes the unconditional case: a caller asking for a *short answer* from a model that
 * *always* thinks can now finish. It does **not** make thinking-off work — that is a separate,
 * endpoint-dependent question (the disable field is not portable across providers: some reject
 * it outright, others need it to produce any text at all), and it is left alone here
 * deliberately. The cap is applied per query, so a caller that sizes its own budget is
 * untouched.
 *
 * Caps stay explicit per call site on purpose: they still bound cost and latency, and a shared
 * "free" default would hide that. This module only refuses to go below the floor.
 */

/** Minimum output budget for a side query on a model that may think before answering. */
export const SIDE_QUERY_MIN_OUTPUT_TOKENS = 1024;

/**
 * Raise a caller's output cap to {@link SIDE_QUERY_MIN_OUTPUT_TOKENS} when it is too small for a
 * model that thinks before answering.
 *
 * `undefined` means "no cap was requested" and is returned unchanged — the floor exists to stop
 * a *small* cap from starving the answer, not to introduce a cap where the caller declined one.
 *
 * A caller that deliberately wants a tiny cap is better served by `disableThinking` (when the
 * endpoint supports it) than by starving the stream: a cap below the thinking length does not
 * yield a shorter answer, it yields **no** answer.
 */
export function applySideQueryOutputFloor(maxOutputTokens: number | undefined): number | undefined {
  if (maxOutputTokens == null) return undefined;
  return Math.max(maxOutputTokens, SIDE_QUERY_MIN_OUTPUT_TOKENS);
}
