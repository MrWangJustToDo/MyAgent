import { Box, useApp, useInput } from "ink";
import { useCallback, useEffect } from "react";

import { useAgent, useAgentContext } from "../hooks";
import { useArgs } from "../hooks/useArgs.js";
import { useSize } from "../hooks/useSize.js";
import { useUserInput } from "../hooks/useUserInput.js";
import { Header, Content, Footer } from "../layout";

import type { AgentContext } from "@my-agent/core";

// Re-export AgentStatus for convenience
export type { AgentStatus } from "@my-agent/core";

export const Agent = () => {
  const { exit } = useApp();

  const { useInitTerminalSize, useAutoElementHeight } = useSize.getActions();

  useInitTerminalSize();

  // useAutoElementHeight();

  // Get config from useArgs hook (reactive selector)
  const { key, initialPrompt } = useArgs((s) => ({ key: s.key, initialPrompt: s.config.initialPrompt }));

  const status = useAgent((s) => s.current?.status || "idle");

  useEffect(() => {
    const cb = useAgent.subscribe(
      (s) => s.current?.context,
      () => {
        const context = useAgent.getReactiveState().current?.context;
        useAgentContext.getActions().setContext(context as AgentContext);
      }
    );

    return cb;
  }, []);

  // Get actions (non-reactive)
  const agentActions = useAgent.getActions();
  const inputActions = useUserInput.getActions();

  // Initialize agent on mount
  useEffect(() => {
    const { model, url, systemPrompt, rootPath, maxSteps } = useArgs.getReadonlyState().config;

    agentActions.initAgent(key, {
      model,
      baseURL: `${url}/v1/`,
      systemPrompt,
      rootPath,
      maxSteps,
    });

    return () => {
      agentActions.destroyCurrent();
    };
  }, [key]);

  // Auto-run if initial prompt provided
  useEffect(() => {
    if (status === "idle" && initialPrompt.trim()) {
      agentActions.runPrompt(initialPrompt.trim());
    }
  }, [status, initialPrompt]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    const prompt = inputActions.submit();
    if (prompt) {
      agentActions.runPrompt(prompt);
    }
  }, []);

  // Handle input
  useInput((inputChar, inputKey) => {
    const status = useAgent.getReadonlyState().current?.status;

    // Normal input handling
    if (status === "running" || status === "initializing") return;

    if (inputKey.ctrl && inputChar === "c") {
      agentActions.destroyCurrent();
      exit();
      return;
    }

    if (inputKey.escape) {
      agentActions.destroyCurrent();
      exit();
      return;
    }

    if (inputKey.return) {
      handleSubmit();
      return;
    }

    if (inputKey.backspace || inputKey.delete) {
      inputActions.backspace();
      return;
    }

    // History navigation
    if (inputKey.upArrow) {
      inputActions.historyPrev();
      return;
    }

    if (inputKey.downArrow) {
      inputActions.historyNext();
      return;
    }

    if (inputChar && !inputKey.ctrl && !inputKey.meta) {
      inputActions.append(inputChar);
    }
  });

  return (
    <Box flexDirection="column">
      {/* Header - Fixed at top */}
      <Header />

      {/* Content - Flexible, takes remaining space */}
      <Content />

      {/* Footer - Fixed at bottom */}
      <Footer />
    </Box>
  );
};
