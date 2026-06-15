import { Box, Text } from "ink";

import { useCommandOutput } from "../hooks/use-command-output.js";

const MAX_VISIBLE = 15;

export const CommandOutput = () => {
  const lines = useCommandOutput((s) => s.lines);
  const title = useCommandOutput((s) => s.title);

  if (!lines) return null;

  const visibleLines = lines.slice(0, MAX_VISIBLE);
  const hasMore = lines.length > MAX_VISIBLE;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {title && (
        <Text color="cyan" bold>
          {title}
        </Text>
      )}
      {visibleLines.map((line, i) => (
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        <Text key={i} color="gray">
          {line}
        </Text>
      ))}
      {hasMore && (
        <Text color="gray" dimColor>
          ... {lines.length - MAX_VISIBLE} more lines
        </Text>
      )}
    </Box>
  );
};
