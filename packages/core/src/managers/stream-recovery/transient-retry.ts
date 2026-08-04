/**
 * Detect transient provider / transport errors that should be retried with backoff
 * (same messages). Distinct from transform retries (reactive compact, multimodal strip).
 */

function errorText(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    const extra = typeof code === "string" ? ` ${code}` : "";
    return `${error.name} ${error.message}${extra}`;
  }
  if (typeof error === "object") {
    const record = error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
    return [record.message, record.code, record.status, record.statusCode].filter(Boolean).join(" ");
  }
  return String(error);
}

function errorStatus(error: unknown): number | undefined {
  if (error == null || typeof error !== "object") return undefined;
  const record = error as { status?: unknown; statusCode?: unknown };
  const raw = record.status ?? record.statusCode;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Billing / permanent quota — do not retry as rate-limit. */
function isNonRetryableQuota(text: string): boolean {
  return /insufficient[_\s-]?quota|billing|payment required|credit(s)? (exhausted|depleted)/i.test(text);
}

/**
 * Whether the failure is likely transient (429 / overload / gateway / network).
 * Used by {@link runStreamWithRecovery} before giving up.
 */
export function isTransientRetryableError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;

  const text = errorText(error);
  if (!text.trim()) return false;
  if (isNonRetryableQuota(text)) return false;

  if (/\b429\b|rate[_\s-]?limit|too many requests|overloaded|server_busy/i.test(text)) return true;
  if (/\b503\b|service unavailable|\b502\b|bad gateway|\b504\b|gateway timeout/i.test(text)) return true;
  if (/econnreset|etimedout|econnrefused|socket hang up|network error|fetch failed/i.test(text)) return true;

  return false;
}

/**
 * Best-effort Retry-After seconds from SDK errors or message text.
 */
export function extractRetryAfterSeconds(error: unknown): number | undefined {
  if (error != null && typeof error === "object") {
    const record = error as {
      headers?: { get?: (name: string) => string | null; "retry-after"?: string };
      retryAfter?: unknown;
    };
    if (typeof record.retryAfter === "number" && record.retryAfter > 0) {
      return record.retryAfter;
    }
    const header =
      record.headers?.get?.("retry-after") ?? record.headers?.get?.("Retry-After") ?? record.headers?.["retry-after"];
    if (header) {
      const asInt = Number(header);
      if (Number.isFinite(asInt) && asInt > 0) return asInt;
    }
  }

  const text = errorText(error);
  const match = text.match(/retry[- ]after[:\s]+(\d+)/i);
  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}
