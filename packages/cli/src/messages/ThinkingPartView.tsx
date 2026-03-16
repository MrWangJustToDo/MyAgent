import { Text } from "ink";
import { memo, useEffect, useState } from "react";

import { FullBox } from "../components/FullBox";
import { Spinner } from "../components/Spinner";

import type { ThinkingPart } from "@my-agent/core";

export interface ThinkingPartViewProps {
  part: ThinkingPart;
}

/** Render a thinking/reasoning part */
export const ThinkingPartView = memo(
  ({ part }: ThinkingPartViewProps) => {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      setLoading(true);

      const id = setTimeout(() => setLoading(false), 1000);

      return () => clearTimeout(id);
    }, [part.content]);

    return (
      <FullBox paddingLeft={2} paddingX={1}>
        {loading ? <Spinner /> : <Text color="green">✓</Text>}
        <Text> </Text>
        <Text color="gray" dimColor wrap="wrap" italic>
          Thinking...
        </Text>
      </FullBox>
    );
  },
  (p, c) => p.part.content === c.part.content
);

ThinkingPartView.displayName = "ThinkingPartView";
