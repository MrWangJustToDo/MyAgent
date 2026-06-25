/**
 * GradientText — Per-character animated gradient text for Ink.
 *
 * Renders each character of a string with a color interpolated along
 * the logo gradient (#00D4FF → #7B61FF → #FF6B9D), with a smooth
 * flowing animation.
 *
 * Consistent with the logo gradient in Header.tsx.
 */

import { Text } from "ink";
import { useState, useEffect } from "react";

import { GRADIENT_STOPS, mapCharsToGradient } from "../utils/gradient.js";

// ============================================================================
// Props
// ============================================================================

export interface GradientTextProps {
  text: string;
  bold?: boolean;
}

const ANIMATION_INTERVAL = 120; // ms between gradient shifts
const PHASE_STEP = 1 / 30; // how much the gradient shifts per tick

// ============================================================================
// Component
// ============================================================================

export const GradientText = ({ text, bold }: GradientTextProps) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((prev) => (prev + PHASE_STEP) % 1);
    }, ANIMATION_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  const chars = mapCharsToGradient(text, GRADIENT_STOPS, phase);

  return (
    <Text bold={bold}>
      {chars.map((c, i) => (
        <Text key={i} color={c.color}>
          {c.ch}
        </Text>
      ))}
    </Text>
  );
};
