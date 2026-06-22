import { Box, Text, useInput } from "ink";
import { useState } from "react";

import type { SessionMeta } from "@my-agent/core";

interface SessionPickerProps {
  sessions: SessionMeta[];
  onSelect: (session: SessionMeta) => void;
  onCancel: () => void;
}

export const SessionPicker = ({ sessions, onSelect, onCancel }: SessionPickerProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(sessions.length - 1, i + 1));
    } else if (key.return) {
      onSelect(sessions[selectedIndex]);
    } else if (key.escape || input === "q") {
      onCancel();
    }
  });

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No sessions found. Starting a new session.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Resume Session
        </Text>
        <Text dimColor> (↑↓ navigate, Enter select, Esc cancel)</Text>
      </Box>

      {sessions.slice(0, 10).map((session, i) => {
        const isSelected = i === selectedIndex;
        const date = new Date(session.updatedAt).toLocaleString();
        return (
          <Box key={session.id}>
            <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
              {isSelected ? "❯ " : "  "}
              {session.name}
            </Text>
            <Text dimColor>
              {" "}
              ({session.model}, {date})
            </Text>
          </Box>
        );
      })}

      {sessions.length > 10 && (
        <Text dimColor>
          {"\n"} ... and {sessions.length - 10} more
        </Text>
      )}
    </Box>
  );
};
