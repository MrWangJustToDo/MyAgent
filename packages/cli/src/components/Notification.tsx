import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";

import { useNotification } from "../hooks/use-notification";

import type { AgentNotification } from "@my-agent/core";

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

  return notification ? (
    <Box gap={2} flexShrink={0}>
      <Text dimColor>|</Text>
      <Text dimColor>{notification.message}</Text>
    </Box>
  ) : null;
};
