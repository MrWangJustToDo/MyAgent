import { chat } from "@tanstack/ai";

import { extractRunErrorMessage } from "../../agent/stream/stream-errors.js";
import { sharedUsageHistory } from "../../agent/usage/usage-history-service.js";
import { calculateCost, extractTanStackUsage, type TokenUsage } from "../../runtime-types/token-usage.js";
import { maxTokensOption } from "../max-tokens-option.js";

import { isStructuredOutputComplete } from "./structured-output-chunk.js";

import type { TextAdapterConfig } from "./adapter-factory.js";
import type { AgentLog } from "../../agent/agent-log";
import type { InferSchemaType, SchemaInput } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export interface SideTextQueryOptions {
  systemPrompt?: string;
  userPrompt: string;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  /**
   * Whether to disable model reasoning/thinking for this lightweight call.
   * Defaults to `true` — memory selection and title generation don't need CoT.
   */
  disableThinking?: boolean;
  /**
   * Optional agent log for failure visibility. The port is otherwise silent: a
   * failed side query used to leave no trace anywhere, and one caller
   * (`session-service` title generation) swallowed it with a bare `catch {}`.
   *
   * Only failures are logged — a success writes nothing, so there is no line per
   * title/summary/memory-selection.
   */
  log?: AgentLog;
}

export interface SideTextQueryResult {
  text: string;
  usage?: TokenUsage;
  /** Wall-clock duration of the underlying LLM call (ms). */
  durationMs: number;
}

/** Options for a structured one-shot query — `schema` selects this overload. */
export interface StructuredQueryOptions<TSchema extends SchemaInput> extends SideTextQueryOptions {
  schema: TSchema;
}

export interface StructuredQueryResult<T> {
  /** The model's response, parsed and validated against the requested schema. */
  data: T;
  /** The raw response text, before parsing (useful for diagnostics). */
  raw: string;
  usage?: TokenUsage;
  /** Wall-clock duration of the underlying LLM call (ms). */
  durationMs: number;
}

/**
 * Log category for every entry this port writes. Dedicated, not a caller's: the
 * same port serves memory, titles, and summaries, so filing under any one of
 * them would misattribute the others.
 */
const SIDE_QUERY_LOG_CATEGORY = "side-query";

/** Cap on the raw-response excerpt attached to a failure warning. */
const RAW_EXCERPT_LIMIT = 500;

// ============================================================================
// Side text query
// ============================================================================

/** One-shot text generation via TanStack `chat()`. */
export function runSideTextQuery(
  textAdapter: TextAdapterConfig,
  options: SideTextQueryOptions
): Promise<SideTextQueryResult>;
/**
 * One-shot structured generation via TanStack `chat({ outputSchema })`.
 *
 * The same port as the text form, selected by `schema` — a second function would
 * duplicate the abort plumbing, the thinking-disable mapping, and the usage
 * accounting, which are the only non-trivial parts.
 */
export function runSideTextQuery<TSchema extends SchemaInput>(
  textAdapter: TextAdapterConfig,
  options: StructuredQueryOptions<TSchema>
): Promise<StructuredQueryResult<InferSchemaType<TSchema>>>;
export async function runSideTextQuery<TSchema extends SchemaInput>(
  textAdapter: TextAdapterConfig,
  options: SideTextQueryOptions & { schema?: TSchema }
): Promise<SideTextQueryResult | StructuredQueryResult<InferSchemaType<TSchema>>> {
  return options.schema
    ? runStructuredQuery(textAdapter, { ...options, schema: options.schema })
    : runTextQuery(textAdapter, options);
}

// ============================================================================
// Text branch
// ============================================================================

async function runTextQuery(
  textAdapter: TextAdapterConfig,
  options: SideTextQueryOptions
): Promise<SideTextQueryResult> {
  const startTime = Date.now();
  const stream = chat({
    adapter: textAdapter.adapter,
    messages: [{ role: "user", content: options.userPrompt }],
    systemPrompts: options.systemPrompt ? [options.systemPrompt] : undefined,
    ...createQueryRequest(textAdapter, options),
  });

  let text = "";
  let usage: TokenUsage | undefined;

  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      text += chunk.delta;
    }
    if (chunk.type === "RUN_FINISHED" && chunk.usage) {
      usage = extractTanStackUsage(chunk.usage);
      recordUsage(textAdapter, usage);
    }
    if (chunk.type === "RUN_ERROR") {
      throw new Error(sideQueryError(extractRunErrorMessage(chunk), textAdapter, options.log, startTime, false));
    }
  }

  return { text: text.trim(), usage, durationMs: Date.now() - startTime };
}

// ============================================================================
// Structured branch
// ============================================================================

/**
 * Reject a top-level non-object schema before the request is built.
 *
 * **This is why the guard exists.** The Anthropic adapter has no
 * `structuredOutputStream`, so `chat({ outputSchema, stream: true })` falls back
 * to its forced-tool `structuredOutput()`, which builds the tool's `input_schema`
 * from the schema's **properties**:
 *
 * ```ts
 * input_schema: { type: "object", properties: outputSchema.properties ?? {}, required: outputSchema.required ?? [] }
 * ```
 *
 * A top-level `array` (or any schema without `properties`) therefore degrades to
 * `{ type: "object", properties: {}, required: [] }` — an empty object the model
 * fills with whatever key it likes. The reply is never an array, so validation
 * fails on **every** call, deterministically. That is exactly how memory
 * extraction returned zero memories for two days while every attempt logged a
 * schema error: the failure looked like a flaky model, not a broken request.
 *
 * The guard turns that silent 100%-failure mode into one loud call-site error.
 * `object` is the contract every provider can honour, so a top-level array is a
 * bug in the caller, not a capability the port should absorb.
 */
function assertObjectRootSchema(schema: SchemaInput): void {
  const root = (schema as { "~standard"?: { jsonSchema?: { input?: () => unknown } } })[
    "~standard"
  ]?.jsonSchema?.input?.();
  // A raw JSON Schema the caller passed through has no `~standard`; nothing to check.
  if (!root || typeof root !== "object") return;
  const type = (root as { type?: unknown }).type;
  if (type === undefined || type === "object") return;
  throw new Error(
    `runSideTextQuery requires a top-level object schema, received \`${JSON.stringify(type)}\`. ` +
      "The provider's structured-output request is built from the schema's `properties`, so a " +
      "non-object root is sent as an empty object and its response can never validate — every call " +
      "fails. Wrap the payload in an object key (e.g. `z.object({ items: z.array(...) })`)."
  );
}

async function runStructuredQuery<TSchema extends SchemaInput>(
  textAdapter: TextAdapterConfig,
  options: StructuredQueryOptions<TSchema>
): Promise<StructuredQueryResult<InferSchemaType<TSchema>>> {
  assertObjectRootSchema(options.schema);
  const startTime = Date.now();

  // `stream: true` is required, not stylistic. The `Promise<T>` form of
  // `chat({ outputSchema })` returns only the parsed object — it never surfaces
  // the adapter's token usage — and it is not iterable. Requesting the stream
  // keeps usage (from `RUN_FINISHED`) and keeps this function's shape familiar.
  const stream = chat({
    adapter: textAdapter.adapter,
    messages: [{ role: "user", content: options.userPrompt }],
    systemPrompts: options.systemPrompt ? [options.systemPrompt] : undefined,
    outputSchema: options.schema,
    stream: true as const,
    ...createQueryRequest(textAdapter, options),
  });

  let text = "";
  let capture: { object: unknown; raw: string } | null = null;
  let usage: TokenUsage | undefined;

  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      text += chunk.delta;
    }
    // The object arrives as a CUSTOM event, already normalized by the engine
    // (optional-field null widening undone). Validation is still ours to do —
    // the streaming path deliberately does not validate, unlike `Promise<T>`.
    if (isStructuredOutputComplete(chunk)) {
      capture = { object: chunk.value.object, raw: chunk.value.raw };
    }
    if (chunk.type === "RUN_FINISHED" && chunk.usage) {
      usage = extractTanStackUsage(chunk.usage);
      recordUsage(textAdapter, usage);
    }
    if (chunk.type === "RUN_ERROR") {
      throw new Error(sideQueryError(extractRunErrorMessage(chunk), textAdapter, options.log, startTime, true));
    }
  }

  const durationMs = Date.now() - startTime;

  if (!capture) {
    const reason = "no structured-output completion event was emitted";
    throw new Error(sideQueryError(reason, textAdapter, options.log, startTime, true, text));
  }

  // Narrow for the closure below: `capture` is reassigned inside the loop, so TS
  // cannot carry the non-null narrowing past the await points on its own.
  const result = capture;

  // Validate explicitly. The schema may also transform (clamping a range,
  // normalizing a timestamp), and the transformed value is what callers must
  // receive — returning the raw object would silently drop every transform.
  const validation = validateAgainstSchema(options.schema, result.object);
  if (!validation.ok) {
    const reason = `response failed schema validation: ${validation.issue}`;
    throw new Error(sideQueryError(reason, textAdapter, options.log, startTime, true, result.raw));
  }

  return {
    data: validation.value as InferSchemaType<TSchema>,
    raw: result.raw,
    usage,
    durationMs,
  };
}

/**
 * Validate with the Standard Schema surface when the caller passed one.
 *
 * Returns the transformed value on success — a schema's transforms are part of
 * its contract (clamping a range, normalizing a timestamp), so discarding
 * `result.value` would hand callers a value the schema never approved.
 *
 * A plain JSON Schema has no validator attached, so it is accepted as-is: the
 * provider already constrained the shape, and rejecting it here would make the
 * port unusable with raw JSON Schemas.
 */
function validateAgainstSchema(schema: SchemaInput, value: unknown): ValidationOutcome {
  const standard = (schema as { "~standard"?: { validate?: (input: unknown) => unknown } })["~standard"];
  if (!standard?.validate) return { ok: true, value };

  const result = standard.validate(value) as
    { value?: unknown; issues?: ReadonlyArray<ValidationIssue> } | Promise<unknown>;
  if (result instanceof Promise) {
    return { ok: false, issue: "schema produced an async validation result, which this port does not support" };
  }
  const issues = result.issues;
  if (issues && issues.length > 0) {
    return { ok: false, issue: issues.map(formatIssue).join("; ") };
  }
  return { ok: true, value: "value" in result ? result.value : value };
}

type ValidationOutcome = { ok: true; value: unknown } | { ok: false; issue: string };

interface ValidationIssue {
  message?: string;
  /** Standard Schema's location of the offending value, e.g. `[1, "body"]`. */
  path?: ReadonlyArray<PropertyKey>;
}

/**
 * Render one issue with its path.
 *
 * The message alone ("expected string, received undefined") does not say *which*
 * entry failed, so a 20-entry array whose second item is malformed reads the
 * same as one whose last item is. That location is the only diagnostic a
 * background extraction gets, so dropping it makes a schema failure
 * indistinguishable from a model that simply returned nothing.
 */
function formatIssue(issue: ValidationIssue): string {
  const message = issue.message ?? "invalid";
  const path = issue.path;
  if (!path || path.length === 0) return message;
  return `${path.map(String).join(".")}: ${message}`;
}

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Build the request options shared by both branches — the AbortController mirror
 * and model options.
 *
 * Extracted so the structured branch cannot drift from the text branch on abort
 * propagation or the per-`modelStyle` thinking disable.
 */
function createQueryRequest(
  textAdapter: TextAdapterConfig,
  options: Pick<SideTextQueryOptions, "abortSignal" | "maxOutputTokens" | "disableThinking">
): { abortController: AbortController; debug: false; modelOptions: Record<string, unknown> } {
  const abortController = new AbortController();
  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      abortController.abort(options.abortSignal.reason);
    } else {
      options.abortSignal.addEventListener("abort", () => abortController.abort(options.abortSignal!.reason), {
        once: true,
      });
    }
  }

  const disableThinking = options.disableThinking ?? true;
  const reasoningOptions =
    disableThinking && textAdapter.reasoning
      ? textAdapter.modelStyle === "anthropic"
        ? { thinking: { type: "disabled" } }
        : { reasoning_effort: "none" }
      : {};

  return {
    abortController,
    debug: false,
    modelOptions: {
      ...maxTokensOption(textAdapter.modelStyle, options.maxOutputTokens),
      ...reasoningOptions,
    },
  };
}

/**
 * Log a failure and return its message for the caller to throw.
 *
 * A `RUN_ERROR` is a stream chunk rather than a throw, so without this the
 * failure never reaches a catch block anywhere in the process — which is how a
 * failed title generation previously left no trace.
 */
function sideQueryError(
  message: string,
  textAdapter: TextAdapterConfig,
  log: AgentLog | undefined,
  startTime: number,
  structured: boolean,
  raw?: string
): string {
  log?.warn(SIDE_QUERY_LOG_CATEGORY, `Side query failed: ${message}`, {
    model: textAdapter.model,
    durationMs: Date.now() - startTime,
    structured,
    ...(raw ? { raw: excerpt(raw) } : {}),
  });
  return message;
}

function recordUsage(textAdapter: TextAdapterConfig, usage: TokenUsage | undefined): void {
  if (!usage) return;
  sharedUsageHistory.record({
    agentId: "side-query",
    model: textAdapter.model,
    usage,
    costUsd: textAdapter.pricing ? calculateCost(usage, textAdapter.pricing) : 0,
  });
}

function excerpt(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length <= RAW_EXCERPT_LIMIT ? trimmed : `${trimmed.slice(0, RAW_EXCERPT_LIMIT)}…`;
}
