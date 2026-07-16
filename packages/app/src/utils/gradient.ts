/**
 * gradient.ts — Shared gradient color utilities.
 *
 * Provides per-character horizontal gradient interpolation for Ink <Text> components.
 * Uses the same color stops as the logo for visual consistency.
 */

import { GRADIENT } from "../theme/colors.js";

// ============================================================================
// Constants
// ============================================================================

/** Live gradient stops from the active theme palette. */
export function getGradientStops(): readonly [string, string, string] {
  return [GRADIENT.cyan, GRADIENT.purple, GRADIENT.pink];
}

// ============================================================================
// Color Utilities
// ============================================================================

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Linearly interpolate between color stops at position t (0–1) */
export function interpolateColor(stops: readonly string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const segments = stops.length - 1;
  const segment = Math.min(Math.floor(clamped * segments), segments - 1);
  const local = clamped * segments - segment;
  const [r1, g1, b1] = hexToRgb(stops[segment]);
  const [r2, g2, b2] = hexToRgb(stops[segment + 1]);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * local),
    Math.round(g1 + (g2 - g1) * local),
    Math.round(b1 + (b2 - b1) * local)
  );
}

// ============================================================================
// Character Color Mapping
// ============================================================================

export interface CharColor {
  ch: string;
  color: string | undefined;
}

/**
 * Map each character of a string to a color along the gradient.
 *
 * @param text - The string to colorize
 * @param stops - Gradient color stops (defaults to live theme gradient)
 * @param offset - Optional phase offset for animation (0–1)
 * @returns Array of { ch, color } for each character
 */
export function mapCharsToGradient(
  text: string,
  stops: readonly string[] = getGradientStops(),
  offset = 0
): CharColor[] {
  const len = Math.max(text.length, 1);
  return [...text].map((ch, i) => ({
    ch,
    color: ch.trim() ? interpolateColor(stops, (i / len + offset) % 1) : undefined,
  }));
}
