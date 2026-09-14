import { builtinPresentation, builtinPresentationNames } from "./builtin-table.js";
import { describePresentation } from "./describe.js";

import type { ToolPresentation, ToolPresentationInfo } from "./types.js";

/**
 * Presentation registry — runtime-registered descriptors (extensions and custom
 * tools) layered over the per-tool declarations that {@link defineServerTool}
 * records, with the built-in fallback table underneath.
 *
 * Cleared on session restore, like the other tool registries, so a stale extension
 * cannot keep describing tools that are no longer loaded.
 */
const registered = new Map<string, ToolPresentation>();
const declared = new Map<string, ToolPresentation>();

/** Called by the tool factories: a built-in or custom tool declares its own metadata. */
export function declareToolPresentation(name: string, present: ToolPresentation): void {
  declared.set(name, present);
}

/** Called by runtime registrars (extensions, dynamic tools). Wins over declarations. */
export function registerToolPresentation(name: string, present: ToolPresentation): void {
  registered.set(name, present);
}

export function getToolPresentation(name: string): ToolPresentation | undefined {
  return registered.get(name) ?? declared.get(name) ?? builtinPresentation(name);
}

/** Serializable catalog for hosts: registered + declared + built-in entries. */
export function describeToolPresentations(): ToolPresentationInfo[] {
  const names = new Set<string>([...registered.keys(), ...declared.keys(), ...builtinPresentationNames()]);
  return Array.from(names, (name) => describePresentation(name, getToolPresentation(name)));
}

export function clearToolPresentation(): void {
  registered.clear();
  declared.clear();
}
