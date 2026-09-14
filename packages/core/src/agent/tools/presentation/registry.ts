import { builtinPresentation, builtinPresentationNames } from "./builtin-table.js";
import { describePresentation } from "./describe.js";

import type { ToolPresentation, ToolPresentationInfo } from "./types.js";

/**
 * Presentation registry — runtime-registered descriptors (extensions and custom
 * tools) layered over the per-tool declarations that {@link defineServerTool}
 * records, with the built-in fallback table underneath.
 *
 * Registered entries are runtime knowledge (extensions, dynamic tools) and are dropped by
 * {@link clearToolPresentation} when a session tears its tool set down. They are *not*
 * persisted: a restored session re-registers from its own startup path, and a host that
 * renders another process's session adopts that session's catalog through
 * {@link hydrateToolPresentations} instead of guessing.
 */
const registered = new Map<string, ToolPresentation>();
const declared = new Map<string, ToolPresentation>();
/** Catalog entries adopted from another process — consulted last, never re-published. */
const hydrated = new Map<string, ToolPresentation>();

/** Called by the tool factories: a built-in or custom tool declares its own metadata. */
export function declareToolPresentation(name: string, present: ToolPresentation): void {
  declared.set(name, present);
}

/** Called by runtime registrars (extensions, dynamic tools). Wins over declarations. */
export function registerToolPresentation(name: string, present: ToolPresentation): void {
  registered.set(name, present);
}

export function getToolPresentation(name: string): ToolPresentation | undefined {
  return registered.get(name) ?? declared.get(name) ?? hydrated.get(name) ?? builtinPresentation(name);
}

/**
 * Adopt a catalog produced by another process (a session snapshot's `toolDescriptors`, or
 * a `session:tool-presentation` event) so a host that never created the tools still folds,
 * labels and keeps rows exactly like the owning process.
 *
 * Only the serializable flags come across — renderers cannot — which is why the per-call
 * payload (`part.display`) carries the rendered text; these flags cover the rows that have
 * no payload (in-flight, restored, declaration-only). Local knowledge always wins, and the
 * adopted entries stay out of {@link describeToolPresentations} so a re-published catalog
 * cannot degrade (it would report renderers as absent).
 */
export function hydrateToolPresentations(descriptors: readonly ToolPresentationInfo[]): void {
  for (const info of descriptors) {
    if (registered.has(info.name) || declared.has(info.name)) continue;
    const present: ToolPresentation = {};
    if (info.category) present.category = info.category;
    if (info.keepRow) present.keepRow = true;
    if (info.detailed) present.detailed = true;
    if (info.clientSide) present.clientSide = true;
    if (info.labelKey) present.labelKey = info.labelKey;
    hydrated.set(info.name, present);
  }
}

/** Serializable catalog for hosts: registered + declared + built-in entries. */
export function describeToolPresentations(): ToolPresentationInfo[] {
  const names = new Set<string>([...registered.keys(), ...declared.keys(), ...builtinPresentationNames()]);
  return Array.from(names, (name) => describePresentation(name, getToolPresentation(name)));
}

export function clearToolPresentation(): void {
  registered.clear();
  declared.clear();
  hydrated.clear();
}
