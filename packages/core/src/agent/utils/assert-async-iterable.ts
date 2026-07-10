/**
 * Ensure a value is async-iterable before `for await` / `yield*`.
 * Prevents the cryptic `Cannot read properties of undefined (reading 'Symbol(Symbol.asyncIterator)')`.
 */
export function assertAsyncIterable<T>(value: unknown, context: string): asserts value is AsyncIterable<T> {
  if (value == null) {
    throw new Error(
      `${context} returned no stream (undefined). Check model baseURL, API key, and provider configuration.`
    );
  }
  if (typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] !== "function") {
    throw new Error(
      `${context} returned a non-stream value (${typeof value}). Expected an async iterable of stream chunks.`
    );
  }
}

/** Map low-level async-iterator errors to actionable messages for UI display. */
export function formatAgentStreamError(error: unknown): Error {
  const err = error instanceof Error ? error : new Error(String(error));
  if (/Symbol\(Symbol\.asyncIterator\)/.test(err.message) || /Symbol\.asyncIterator/.test(err.message)) {
    return new Error(
      "Agent stream failed to start. Verify BASE_URL (or --base-url), API_KEY, and that the model endpoint is reachable."
    );
  }
  return err;
}
