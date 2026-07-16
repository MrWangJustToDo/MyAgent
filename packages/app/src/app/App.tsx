import { SessionStore } from "@my-agent/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";

import { Debug } from "../components/Debug.js";
import { Help } from "../components/Help.js";
import { SessionPicker } from "../components/SessionPicker.js";
import { Spinner } from "../components/Spinner.js";
import { useConfig } from "../hooks/use-config.js";
import { useTheme } from "../hooks/use-theme.js";
import { COLORS } from "../theme/colors.js";

import { Agent } from "./Agent.js";

import type { SessionMeta } from "@my-agent/core";

export const App = () => {
  // Subscribe so /theme palette mutations re-render the tree.
  useTheme((s) => s.theme);

  const helpRequested = useConfig((s) => s.helpRequested);
  const debug = useConfig((s) => s.config.debug);
  const resumeSession = useConfig((s) => s.config.resumeSession);

  const [showPicker, setShowPicker] = useState(resumeSession === "__picker__");
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string>("");

  useEffect(() => {
    if (!showPicker) return;

    (async () => {
      try {
        const store = new SessionStore();
        const list = await store.list();
        setSessions(list);
        if (list.length === 0) {
          useConfig.getActions().setConfig("resumeSession", "");
          setShowPicker(false);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        setShowPicker(false);
      }
    })();
  }, [showPicker]);

  if (helpRequested) {
    return (
      <Box flexDirection="column">
        <Help />
      </Box>
    );
  }

  if (showPicker) {
    if (loadError) {
      return (
        <Box padding={1}>
          <Text color={COLORS.danger}>Error loading sessions: {loadError}</Text>
        </Box>
      );
    }
    if (!sessions) {
      return (
        <Box padding={1}>
          <Spinner text="Loading sessions..." />
        </Box>
      );
    }
    return (
      <SessionPicker
        sessions={sessions}
        onSelect={(session: SessionMeta) => {
          useConfig.getActions().setConfig("resumeSession", session.id);
          setShowPicker(false);
        }}
        onCancel={() => {
          useConfig.getActions().setConfig("resumeSession", "");
          setShowPicker(false);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {debug && <Debug />}
      <Agent />
    </Box>
  );
};
