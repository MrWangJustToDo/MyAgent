import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";

import { useNotification } from "../hooks/use-notification";
import { COLORS } from "../theme/colors.js";

import type { AgentNotification } from "@my-agent/core";

const LEVEL_COLORS: Record<string, string> = {
  info: COLORS.primary,
  success: COLORS.success,
  warning: COLORS.warning,
  error: COLORS.danger,
};

export const Notification = () => {
  const [notification, setNotification] = useState<AgentNotification>();

  const notifications = useNotification((s) => s.state);

  const loopRef = useRef(false);

  useEffect(() => {
    if (loopRef.current) return;
    const startLoop = () => {
      if (useNotification.getReadonlyState().state.length === 0) {
        loopRef.current = false;
        setNotification(undefined);
        return;
      } else {
        loopRef.current = true;
        setNotification(useNotification.getActions().consume());
        setTimeout(() => {
          startLoop();
        }, 3000);
      }
    };
    startLoop();
  }, [notifications.length]);

  if (!notification) return null;

  const color = LEVEL_COLORS[notification.level] || COLORS.muted;

  return (
    <Box gap={2} flexShrink={0}>
      <Text dimColor>|</Text>
      <Text color={color} dimColor={notification.level === "info"}>
        {notification.message}
      </Text>
    </Box>
  );
};
