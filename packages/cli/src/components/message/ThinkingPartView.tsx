import { TitledBox } from "@mishieck/ink-titled-box";
import { Text } from "ink";

import { FullBox } from "../FullBox";

import type { ThinkingPart } from "@my-agent/core";

export interface ThinkingPartViewProps {
  part: ThinkingPart;
}

/** Render a thinking/reasoning part */
export const ThinkingPartView = ({ part }: ThinkingPartViewProps) => (
  <FullBox>
    <TitledBox
      titles={["Thinking:"]}
      width="100%"
      borderStyle="round"
      borderColor="magenta"
      paddingLeft={2}
      paddingX={1}
    >
      <Text color="gray" dimColor wrap="wrap">
        {part.content.trimEnd()}
      </Text>
    </TitledBox>
  </FullBox>
);
