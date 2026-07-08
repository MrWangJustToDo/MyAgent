/**
 * Validates assertAsyncIterable and formatAgentStreamError.
 *
 * Run: pnpm --filter @my-agent/core run validate:assert-async-iterable
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { assertAsyncIterable, formatAgentStreamError } from "../dist/dev.mjs";

assert.throws(() => assertAsyncIterable(undefined, "test"), /returned no stream/);

assert.throws(() => assertAsyncIterable({}, "test"), /non-stream value/);

async function* okStream() {
  yield 1;
}

assertAsyncIterable(okStream(), "test");

const formatted = formatAgentStreamError(
  new Error("Cannot read properties of undefined (reading 'Symbol(Symbol.asyncIterator)')")
);
assert.match(formatted.message, /BASE_URL/);

console.log("assert-async-iterable validation passed");
