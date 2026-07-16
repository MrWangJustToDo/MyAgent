/**
 * Runtime theme palette — starts as gemini; switch via {@link applyColorPalette}.
 *
 * Call sites keep `import { COLORS, BG, GRADIENT } from "../theme/colors.js"`.
 * After apply, Object.assign updates these objects in place; subscribe to
 * `useTheme` at the app root so Ink re-renders with the new colors.
 */

import * as claude from "./colors-claude.js";
import * as gemini from "./colors-gemini.js";

export type ThemeName = "gemini" | "claude";

export const THEME_NAMES: readonly ThemeName[] = ["gemini", "claude"];

export { interpolateColor } from "./colors-gemini.js";

const palettes = {
  gemini,
  claude,
} as const;

/** Mutable semantic colors — mutated by {@link applyColorPalette}. */
export const COLORS = { ...gemini.COLORS };

/** Mutable background colors — mutated by {@link applyColorPalette}. */
export const BG = { ...gemini.BG };

/** Mutable brand gradient stops — mutated by {@link applyColorPalette}. */
export const GRADIENT = { ...gemini.GRADIENT };

/**
 * Apply a named palette onto the shared {@link COLORS} / {@link BG} / {@link GRADIENT} objects.
 */
export function applyColorPalette(name: ThemeName): void {
  const palette = palettes[name];
  Object.assign(COLORS, palette.COLORS);
  Object.assign(BG, palette.BG);
  Object.assign(GRADIENT, palette.GRADIENT);
}

export function isThemeName(value: string): value is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value);
}
