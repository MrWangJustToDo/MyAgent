/** LSP extension debug logging — enabled via MYAGENT_LSP_DEBUG=1. */

let enabled = false;

try {
  if (typeof process !== "undefined" && process.env?.MYAGENT_LSP_DEBUG === "1") {
    enabled = true;
  }
} catch {
  // Non-Node runtime — debug off
}

export function isLspDebug(): boolean {
  return enabled;
}

export function debug(...args: unknown[]): void {
  if (!enabled) return;
  try {
    console.error("[LSP]", ...args);
  } catch {
    // ignore
  }
}
