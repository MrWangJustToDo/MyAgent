// ============================================================================
// ID Generation Utilities
// ============================================================================

/**
 * Generate a unique ID with a prefix.
 *
 * Format: `{prefix}_{timestamp}_{random}`
 *
 * @example
 * ```typescript
 * generateId("ctx");   // "ctx_m1abc123_x4y5z6"
 * generateId("log");   // "log_m1abc123_a1b2c3"
 * generateId("todo");  // "todo_m1abc123_d4e5f6"
 * ```
 */
export const generateId = (prefix: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * Generate a short random ID (no prefix, no timestamp).
 *
 * Useful for items within a collection where uniqueness is local.
 *
 * @example
 * ```typescript
 * generateShortId();  // "x4y5z6"
 * ```
 */
export const generateShortId = (): string => {
  return Math.random().toString(36).substring(2, 8);
};

/**
 * Create a counter-based ID generator for sequential IDs.
 *
 * Useful when ordering matters (e.g., log entries within same millisecond).
 *
 * Format: `{prefix}_{timestamp}_{counter}`
 *
 * @example
 * ```typescript
 * const generateLogId = createSequentialIdGenerator("log");
 * generateLogId();  // "log_m1abc123_0000"
 * generateLogId();  // "log_m1abc123_0001"
 * ```
 */
export const createSequentialIdGenerator = (prefix: string): (() => string) => {
  let counter = 0;
  return () => {
    const timestamp = Date.now().toString(36);
    const seq = (counter++).toString(36).padStart(4, "0");
    return `${prefix}_${timestamp}_${seq}`;
  };
};
