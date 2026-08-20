/** LSP extension timing constants. */

/** How long to wait after a write/edit for the LSP to publish updated diagnostics. */
export const DIAGNOSTIC_SETTLE_DELAY_MS = 1500;

/**
 * How long auto-diagnostics waits for a lazily-started server to become ready
 * before giving up (first write that triggers startup must not skip injection).
 */
export const AUTO_DIAG_SERVER_WAIT_MS = 15000;

/**
 * Upper bound for how long auto-diagnostics polls after a write/edit waiting
 * for the server to publish diagnostics. Large projects (monorepo roots) can
 * take longer than {@link DIAGNOSTIC_SETTLE_DELAY_MS} to analyze a file.
 */
export const AUTO_DIAG_SETTLE_TIMEOUT_MS = 8000;

/** Poll interval when waiting for diagnostics to appear after a write/edit. */
export const AUTO_DIAG_SETTLE_POLL_MS = 300;

/** Server restart: initial backoff, max backoff, max attempts per session. */
export const RESTART_INITIAL_BACKOFF_MS = 1000;
export const RESTART_MAX_BACKOFF_MS = 30000;
export const RESTART_MAX_ATTEMPTS = 3;

/** Graceful shutdown timeout for an LSP server. */
export const SHUTDOWN_TIMEOUT_MS = 3000;

/** Delay after synthetic didChange before requesting member completions. */
export const SYNTHETIC_DOT_SETTLE_DELAY_MS = 100;

/** Timeout when connecting to a shared daemon socket. */
export const SOCKET_CONNECT_TIMEOUT_MS = 10_000;
