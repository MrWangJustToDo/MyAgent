import { agentManager } from "@my-agent/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";

import { Debug } from "../components/Debug.js";
import { Help } from "../components/Help.js";
import { SessionPicker } from "../components/SessionPicker.js";
import { Spinner } from "../components/Spinner.js";
import { useArgs } from "../hooks/use-args.js";
import { createAgent } from "../utils/create.js";

import { Agent } from "./Agent.js";

import type { SessionMeta } from "@my-agent/core";

export const App = () => {
  const helpRequested = useArgs((s) => s.helpRequested);
  const resumeSession = useArgs((s) => s.config.resumeSession);

  const [showPicker, setShowPicker] = useState(resumeSession === "__picker__");
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string>("");

  // Load session list when picker is needed
  useEffect(() => {
    if (!showPicker) return;
    const config = useArgs.getReactiveState().config;

    (async () => {
      try {
        const { agent } = await createAgent({
          model: config.model,
          url: config.url,
          rootPath: config.rootPath,
          maxIterations: config.maxIterations,
          provider: config.provider,
          apiKey: config.apiKey,
        });
        const store = agent.getSessionStore();
        if (store) {
          const list = await store.list();
          setSessions(list);
          if (list.length === 0) {
            // No sessions — just start fresh
            useArgs.getActions().setConfig("resumeSession", "");
            setShowPicker(false);
          }
        } else {
          useArgs.getActions().setConfig("resumeSession", "");
          setShowPicker(false);
        }
        // Destroy the temporary agent used just for listing
        agentManager.destroyAgent(agent.id);
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
          <Text color="red">Error loading sessions: {loadError}</Text>
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
          useArgs.getActions().setConfig("resumeSession", session.id);
          setShowPicker(false);
        }}
        onCancel={() => {
          useArgs.getActions().setConfig("resumeSession", "");
          setShowPicker(false);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {process.env.DEV && <Debug />}
      <Agent />
    </Box>
  );
};
