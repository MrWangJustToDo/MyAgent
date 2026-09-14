import { builtinPresentation } from "./builtin-table.js";
import { inlineSummaryForOutput } from "./inline-summary.js";
import { formatToolOutput } from "./output-format.js";
import { getToolPresentation } from "./registry.js";

import type { ToolDisplayPayload } from "./types.js";

function nonEmpty(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Renderers run inside the agent loop now, so a renderer that throws (or returns
 * nonsense) must never take the run down: a tool's display payload is cosmetic, the
 * tool result itself is not.
 */
function safe<T>(render: () => T): T | undefined {
  try {
    return render();
  } catch {
    return undefined;
  }
}

/**
 * Render a tool call's display payload — **once, at completion**, in core.
 *
 * Hosts read the result off the tool-call part (`part.display`), so nothing about how
 * a tool looks has to be reachable in the host process: remote CoreEnv / Agent Session
 * and extension hosts get the same strings as the local CLI.
 *
 * `text` prefers the tool's own renderer (`present.text`); a built-in without one falls
 * back to the built-in output switch. `summary` prefers `present.summary`, then the
 * built-in inline summary. `label` is the tool's declarative input label.
 *
 * Deterministic by construction: every renderer is a pure function of the stored
 * output / parsed input (see {@link ToolPresentation}), so the payload can be persisted
 * with the session and replayed without changing the prompt prefix.
 */
export function computeToolDisplay(name: string, output: unknown, input?: unknown): ToolDisplayPayload | undefined {
  if (!name) return undefined;

  const present = getToolPresentation(name);
  const text =
    safe(() => present?.text?.(output)) ??
    safe(() => (builtinPresentation(name) ? formatToolOutput(output, name) : undefined));
  const summary =
    safe(() => present?.summary?.(output)) ?? safe(() => inlineSummaryForOutput(output, name)) ?? undefined;
  const label = safe(() => present?.label?.(input)) ?? undefined;

  const display: ToolDisplayPayload = {};
  const body = nonEmpty(text);
  if (body) display.text = body;
  const head = nonEmpty(summary);
  if (head) display.summary = head;
  if (label) display.label = label;

  return Object.keys(display).length > 0 ? display : undefined;
}
