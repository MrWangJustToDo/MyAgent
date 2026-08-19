/** LSP extension timing constants. */

/** How long to wait after a write/edit for the LSP to publish updated diagnostics. */
export const DIAGNOSTIC_SETTLE_DELAY_MS = 300;

/** Server restart: initial backoff, max backoff, max attempts per session. */
export const RESTART_INITIAL_BACKOFF_MS = 1000;
export const RESTART_MAX_BACKOFF_MS = 30000;
export const RESTART_MAX_ATTEMPTS = 3;

/** Graceful shutdown timeout for an LSP server. */
export const SHUTDOWN_TIMEOUT_MS = 3000;

/** Timeout when connecting to a shared daemon socket. */
export const SOCKET_CONNECT_TIMEOUT_MS = 10_000;
