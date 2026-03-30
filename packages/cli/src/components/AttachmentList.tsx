import { Box, Text } from "ink";

import { useUserInput } from "../hooks/use-user-input.js";
import { formatSize } from "../utils/file-attachment.js";

export const AttachmentList = () => {
  const attachments = useUserInput((s) => s.attachments);
  const selectedIndex = useUserInput((s) => s.selectedAttachment);
  const inputError = useUserInput((s) => s.inputError);

  if (!attachments.length && !inputError) return null;

  return (
    <Box flexDirection="column">
      {inputError && (
        <Box>
          <Text color="red">{inputError}</Text>
        </Box>
      )}
      {attachments.length > 0 && (
        <Box flexDirection="column">
          {attachments.map((a, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={a.path + i} gap={1}>
                <Text color={isSelected ? "white" : "gray"}>{isSelected ? ">" : " "}</Text>
                <Text color={a.type === "image" ? "magenta" : "cyan"} bold={isSelected}>
                  {a.type === "image" ? "IMG" : "TXT"}
                </Text>
                <Text bold={isSelected}>{a.filename}</Text>
                <Text color="gray" dimColor>
                  ({formatSize(a.size)})
                </Text>
                {isSelected && (
                  <Text color="gray" dimColor>
                    Del to remove
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
