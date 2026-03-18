import { Text } from "ink";

import { FullBox } from "../components/FullBox";
import { Spinner } from "../components/Spinner";

/**
 * Reasoning part from AI SDK (previously called "thinking")
 */
export interface ReasoningUIPart {
  type: "reasoning";
  text: string;
  state?: "streaming" | "done";
}

export interface ThinkingPartViewProps {
  part: ReasoningUIPart;
}

/** Render a reasoning/thinking part */
export const ThinkingPartView = ({ part }: ThinkingPartViewProps) => {
  return (
    <FullBox paddingLeft={2} paddingX={1}>
      {part.state === "streaming" ? <Spinner /> : <Text color="green">✓</Text>}
      <Text> </Text>
      <Text color="gray" dimColor wrap="wrap" italic>
        Thinking...
      </Text>
    </FullBox>
  );
};

ThinkingPartView.displayName = "ThinkingPartView";
