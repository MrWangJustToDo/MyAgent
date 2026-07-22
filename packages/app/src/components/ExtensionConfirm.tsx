import { Box, Text, useInput } from "ink";
import { useMemo } from "react";

import { COLORS } from "../theme/colors.js";

export const ExtensionConfirm = ({
  confirm,
  onRespond,
}: {
  confirm: { id: string; question: string };
  onRespond: (id: string, ok: boolean) => void;
}) => {
  useInput(
    useMemo(() => {
      return (_input: string, key: { y?: boolean; n?: boolean; escape?: boolean }) => {
        if (key.y) {
          onRespond(confirm.id, true);
        } else if (key.n || key.escape) {
          onRespond(confirm.id, false);
        }
      };
    }, [confirm.id, onRespond])
  );

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={COLORS.warning} bold>
        Confirm:
      </Text>
      <Text color={COLORS.primary}>{confirm.question}</Text>
      <Text color={COLORS.muted} dimColor>
        y: approve | n: deny
      </Text>
    </Box>
  );
};
