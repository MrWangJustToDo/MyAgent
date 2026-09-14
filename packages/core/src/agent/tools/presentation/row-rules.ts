import { getToolPresentation } from "./registry.js";

/**
 * Row-visibility rules — owned by core so every host folds a completed tool run the
 * same way.
 *
 * A completed call keeps its own row when the tool declares `keepRow` (structured or
 * interactive results), when the host supplies the result (`clientSide`), or when the
 * tool has a result renderer (`text`): that rendered line *is* the row's content, so
 * folding it away would hide the tool's output entirely.
 */
export function keepsCompactRow(name: string): boolean {
  const present = getToolPresentation(name);
  return Boolean(present?.keepRow || present?.clientSide || present?.text);
}
