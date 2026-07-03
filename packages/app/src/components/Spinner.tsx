import { Text } from "ink";
import { useEffect } from "react";

import { useGlobalSpinner, frames } from "../hooks/use-global-spinner.js";
import { mapCharsToGradient, GRADIENT_STOPS } from "../utils/gradient.js";

export interface SpinnerProps {
  text?: string;
}

export const Spinner = ({ text }: SpinnerProps) => {
  const frame = useGlobalSpinner((s) => s.frame);
  const phase = useGlobalSpinner((s) => s.phase);

  useEffect(() => {
    useGlobalSpinner.getActions().init();
    return () => {
      useGlobalSpinner.getActions().dispose();
    };
  }, []);

  const displayText = text ? `${frames[frame]} ${text}` : frames[frame];
  const chars = mapCharsToGradient(displayText, GRADIENT_STOPS, 1 - phase);

  return (
    <Text wrap="truncate-end">
      {chars.map((c, i) => (
        <Text key={i} color={c.color}>
          {c.ch}
        </Text>
      ))}
    </Text>
  );
};
