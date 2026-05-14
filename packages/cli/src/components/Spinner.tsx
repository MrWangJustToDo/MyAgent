import { Text } from "ink";
import { useState, useEffect } from "react";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface SpinnerProps {
  text?: string;
}

export const Spinner = ({ text }: SpinnerProps) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 100);

    return () => clearInterval(timer);
  }, []);

  return (
    <Text wrap="truncate-end">
      <Text color="cyan">{frames[frame]}</Text>
      {text && <Text> {text}</Text>}
    </Text>
  );
};
