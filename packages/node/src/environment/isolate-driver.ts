/**
 * Node.js isolate driver for sandboxed TypeScript execution (code-mode).
 *
 * Lazily loads `@tanstack/ai-isolate-node` (which depends on the `isolated-vm`
 * native addon) on first call and returns `null` if it can't be loaded or the
 * addon is incompatible with the current Node runtime. Returning `null` lets the
 * built-in code-mode extension degrade gracefully (warns, registers no
 * `execute_typescript`) instead of crashing `createNodeEnv` at module load time.
 *
 * The `skipProbe` flag is intentionally not exposed here: the subprocess probe
 * in `createNodeIsolateDriver` is the safety net that turns a segfault-prone
 * native-addon mismatch into a catchable Error, which this function then
 * converts into a `null` (degrade).
 */
import type { IsolateDriver } from "@tanstack/ai-code-mode";

/**
 * Create a Node.js isolate driver backed by `isolated-vm`, or `null` when the
 * native addon is unavailable/incompatible (code-mode degrades gracefully).
 */
export async function createNodeIsolateDriver(): Promise<IsolateDriver | null> {
  try {
    const { createNodeIsolateDriver } = await import("@tanstack/ai-isolate-node");
    return createNodeIsolateDriver();
  } catch (err) {
    console.warn(
      `[node] code-mode isolate driver unavailable (degrading): ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
