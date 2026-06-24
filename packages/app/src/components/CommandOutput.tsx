import { Box, Text } from "ink";

import { COMMAND_OUTPUT_MAX_VISIBLE, useCommandOutput } from "../hooks/use-command-output.js";

import { ScrollableList } from "./ScrollableList.js";

/**
 * Render a single content line. Empty strings are replaced with a space to
 * ensure they still occupy one line of terminal height -- otherwise Ink
 * collapses them to zero height, causing visible height changes on scroll.
 */
const renderLine = (line: string) => <Text color="gray">{line || " "}</Text>;

export const CommandOutput = () => {
  const lines = useCommandOutput((s) => s.lines);
  const title = useCommandOutput((s) => s.title);
  const scrollOffset = useCommandOutput((s) => s.scrollOffset);

  if (!lines) return null;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {title && (
        <Text color="cyan" bold>
          {title}
        </Text>
      )}
      <ScrollableList
        items={lines as string[]}
        maxVisible={COMMAND_OUTPUT_MAX_VISIBLE}
        scrollOffset={scrollOffset}
        renderItem={renderLine}
      />
    </Box>
  );
};
