/**
 * Shared error handler for AI SDK UI message streams.
 *
 * The AI SDK's default `onError` (used by `toUIMessageStream` /
 * `toUIMessageChunk`) returns the generic string `'An error occurred.'` to
 * avoid leaking server-side error details to clients. That default is
 * appropriate for HTTP transports, but for in-process transports
 * (`DirectChatTransport`) the error text is both shown in the UI AND fed back
 * to the LLM on the next turn (via `convertToModelMessages`).
 *
 * With the default, the LLM only ever sees "An error occurred." for a failed
 * tool call, so it cannot tell *why* the call failed (e.g. a missing required
 * schema field) and must blindly retry. Surfacing the real error message lets
 * the model correct itself on the first retry.
 *
 * The `error` argument can be:
 *  - an `Error` instance (e.g. thrown from a tool's `execute`)
 *  - a `string` (e.g. `getErrorMessage(error)` for invalid tool inputs, as
 *    emitted by `stream-language-model-call.ts`)
 *  - any other value (serialised to JSON)
 *
 * ### Zod / schema-validation handling
 *
 * Tool input validation failures travel through several wrappers before
 * reaching this handler:
 *
 *   ZodError  ─cause→  TypeValidationError  ─cause→  InvalidToolInputError
 *
 * (see `@ai-sdk/provider-utils`'s `safeValidateTypes` → `parse-tool-call.ts`).
 * Each wrapper bakes a pre-serialised message via `getErrorMessage`, so the
 * raw `error.message` is verbose and leaks internal class names
 * (`AI_InvalidToolInputError: ... AI_TypeValidationError: ... Error message: [...]`).
 *
 * For the LLM that noise is useless; what it actually needs is the *list of
 * schema issues* (which field, what was expected). So when a Zod error is
 * detectable — either directly, nested in an `Error.cause` chain, or as the
 * `.issues`/`.error.issues` property of a deserialised payload — we extract a
 * compact, model-friendly summary instead of forwarding the wrapped message
 * verbatim. This works for both Zod v3 (`errors`/`issues`) and Zod v4
 * (`issues`), and survives JSON round-tripping across the RPC transport (where
 * class identity is lost but `.issues` survives on plain objects).
 */

/** A single validation issue in the loose shape produced by Zod v3/v4. */
interface ValidationIssue {
  code?: string;
  message?: string;
  path?: Array<string | number>;
  expected?: string;
  received?: string;
  values?: unknown;
}

/**
 * Extract Zod-like validation issues from a value, recognising:
 *  - `ZodError` instances (`.issues` / `.errors`)
 *  - plain objects carrying `.issues` or `.error.issues` (post-RPC)
 *  - errors whose `.cause` chain hides a Zod error (AISDK wrappers)
 * Returns `null` when no issues are found.
 */
function extractZodIssues(error: unknown): ValidationIssue[] | null {
  if (error == null || typeof error !== "object") return null;

  // Collect the error itself plus every node in its `.cause` chain so a
  // wrapped error (TypeValidationError / InvalidToolInputError) still surfaces
  // the underlying Zod issues.
  const candidates: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    candidates.push(current);
    current = (current as { cause?: unknown }).cause;
  }

  for (const candidate of candidates) {
    if (candidate == null || typeof candidate !== "object") continue;
    const obj = candidate as Record<string, unknown>;
    const issues =
      (Array.isArray(obj.issues) && obj.issues) ||
      (Array.isArray(obj.errors) && obj.errors) ||
      (obj.error != null &&
        typeof obj.error === "object" &&
        Array.isArray((obj.error as Record<string, unknown>).issues) &&
        (obj.error as Record<string, unknown>).issues) ||
      null;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (issues && issues.length > 0) {
      return issues as ValidationIssue[];
    }
  }
  return null;
}

/** Render a single validation issue into a compact, model-readable line. */
function formatIssue(issue: ValidationIssue): string {
  const path =
    Array.isArray(issue.path) && issue.path.length > 0
      ? issue.path.map((segment) => (typeof segment === "number" ? `[${segment}]` : segment)).join(".")
      : "(root)";
  const detail = issue.message ?? issue.code ?? "invalid";
  return `  - at "${path}": ${detail}`;
}

/**
 * Try to reconstruct Zod issues embedded in a pre-serialised message string.
 *
 * The AI SDK (and our own `Error.message`/`.toString()`) bakes the Zod issues
 * into the error text as a JSON array, e.g.:
 *
 *   "...Error message: [{"code":"invalid_type","path":["title"],...}]"
 *
 * When the error reaches this handler already stringified (the `tool-error`
 * stream part, or any post-RPC plain object whose `.message` swallowed the
 * issues), structured extraction fails. We salvage the issues by scanning the
 * string for the first JSON array of validation-issue-shaped objects.
 *
 * Returns the parsed issues, or `null` if the string carries none.
 */
function extractZodIssuesFromString(text: string): ValidationIssue[] | null {
  // Look for the first balanced JSON array in the string. Start from each '['
  // and attempt to JSON.parse the slice up to the matching ']'.
  for (let start = text.indexOf("["); start !== -1; start = text.indexOf("[", start + 1)) {
    // Track bracket depth to find the matching close.
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "[") {
        depth++;
      } else if (ch === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;

    const candidate = text.slice(start, end + 1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) continue;

    // Validate each element looks like a Zod issue (has `path` or `code`).
    const issues = parsed.filter(
      (item): item is ValidationIssue =>
        item != null && typeof item === "object" && ("path" in item || "code" in item || "message" in item)
    );
    if (issues.length === parsed.length && issues.length > 0) {
      return issues;
    }
  }
  return null;
}

/**
 * Render Zod issues into a model-friendly block. Returns `null` if `error`
 * does not carry any recognisable validation issues.
 */
function formatZodError(error: unknown): string | null {
  const issues = extractZodIssues(error);
  if (issues == null) return null;
  const lines = issues.map(formatIssue).join("\n");
  return `Input failed schema validation with ${issues.length} issue(s):\n${lines}`;
}

/**
 * Like {@link formatZodError} but for pre-stringified error text. Attempts to
 * reconstruct the issues from an embedded JSON array; falls back to `null`.
 */
function formatZodErrorFromString(text: string): string | null {
  const issues = extractZodIssuesFromString(text);
  if (issues == null) return null;
  const lines = issues.map(formatIssue).join("\n");
  return `Input failed schema validation with ${issues.length} issue(s):\n${lines}`;
}

export function toolStreamOnError(error: unknown): string {
  // 1. Zod / schema-validation errors — surface the issues directly, whether
  //    the error is a live ZodError, an AISDK-wrapped error, or a plain
  //    deserialised object from the RPC transport.
  const zodSummary = formatZodError(error);
  if (zodSummary != null) {
    return zodSummary;
  }

  // 2. Pre-stringified by the AI SDK (the `tool-error` stream part runs the
  //    error through `getErrorMessage` before invoking `onError`). The string
  //    usually embeds the Zod issues as a JSON array; try to reconstruct them
  //    into a compact summary. If reconstruction fails, pass the string through
  //    unchanged so the model still sees the (verbose) original.
  if (typeof error === "string") {
    const fromString = formatZodErrorFromString(error);
    if (fromString != null) return fromString;
    return error;
  }

  // 3. Live Error instances. Prefer `.message`, but also walk `.cause` in case
  //    a wrapper (e.g. a non-AISDK Error) hid the useful text on the cause.
  if (error instanceof Error) {
    let current: unknown = error;
    const seen = new Set<unknown>();
    while (current instanceof Error && !seen.has(current)) {
      seen.add(current);
      const msg = current.message;
      if (typeof msg === "string" && msg.trim().length > 0) {
        return msg;
      }
      current = (current as { cause?: unknown }).cause;
    }
    return error.name || "An error occurred.";
  }

  // 4. Plain objects with a `message` property (e.g. minimal error payloads).
  if (typeof error === "object" && error && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  }

  // 5. Arrays — join the first non-empty renderable element.
  if (Array.isArray(error)) {
    return error.reduce((p, c) => p || toolStreamOnError(c), "");
  }

  // 6. Fallback — best-effort JSON serialisation.
  try {
    return JSON.stringify(error);
  } catch {
    return "An error occurred.";
  }
}
