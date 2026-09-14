import { builtinPresentation, builtinPresentationNames } from "./builtin-table.js";
import { describePresentation } from "./describe.js";

import type { ToolPresentation, ToolPresentationInfo } from "./types.js";

/**
 * Presentation registry — runtime-registered descriptors (extensions and custom
 * tools) layered over the per-tool declarations that {@link defineServerTool}
 * records, with the built-in fallback table underneath.
 *
 * Registered entries are runtime knowledge (extensions, dynamic tools). An entry is dropped
 * by {@link forgetToolPresentation} when its tool actually goes away (extension disabled or
 * unloaded); {@link clearToolPresentation} is the wholesale reset. Nothing is persisted — a
 * restored session rebuilds its own entries, and a host rendering another process's session
 * adopts that session's catalog through {@link hydrateToolPresentations}.
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
 *
 * Scope: the adoption layer is process-global, like the rest of this registry (declarations and
 * registrations are too), so **the last adoption wins**. That matches the current hosts, which
 * render one remote session at a time; a process that renders several sessions at once (an
 * IM bridge fan-out, a multi-session panel) would need per-session scoping — an overlay keyed
 * by session id consulted before this layer — not merely a bigger map here.
 */
export function hydrateToolPresentations(descriptors: readonly ToolPresentationInfo[]): void {
  // Tolerate a publisher that predates the field (its payload simply has no descriptors).
  // This must come FIRST: a malformed payload keeping the previous adoption is a no-op, while
  // clearing first would silently wipe every row rule the host already learned.
  if (!Array.isArray(descriptors)) return;
  // A catalog is always the complete set (snapshot or event), so adopting one replaces the
  // previous adoption — otherwise a tool the owner dropped keeps ruling this host's rows.
  hydrated.clear();
  for (const info of descriptors) {
    if (registered.has(info.name) || declared.has(info.name)) continue;
    const present: ToolPresentation = {};
    if (info.category) present.category = info.category;
    if (info.keepRow) present.keepRow = true;
    if (info.detailed) present.detailed = true;
    if (info.clientSide) present.clientSide = true;
    if (info.labelKey) present.labelKey = info.labelKey;
    // The renderer itself cannot cross processes, but its *existence* is what
    // `keepsCompactRow` (keepRow || clientSide || text) keys off. A presence-only stub keeps the
    // owner's row shape; it is never called here, and hosts render the shipped
    // `part.display.text` instead.
    if (info.hasText) present.text = () => undefined;
    hydrated.set(info.name, present);
  }
}

/** Serializable catalog for hosts: registered + declared + built-in entries. */
export function describeToolPresentations(): ToolPresentationInfo[] {
  const names = new Set<string>([...registered.keys(), ...declared.keys(), ...builtinPresentationNames()]);
  return Array.from(names, (name) => describePresentation(name, getToolPresentation(name)));
}

/**
 * Drop everything known about one tool — used when a tool goes away for real (an extension
 * is disabled or unloaded). Without it the catalog keeps describing tools that are gone and
 * those tools' historical rows wrongly count as "owns a compact row".
 */
export function forgetToolPresentation(name: string): void {
  registered.delete(name);
  declared.delete(name);
  hydrated.delete(name);
}

export function clearToolPresentation(): void {
  registered.clear();
  declared.clear();
  hydrated.clear();
}
