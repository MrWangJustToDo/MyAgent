import { Box, useApp, useInput } from "ink";
import { useCallback, useEffect, useMemo } from "react";

import { useAgent } from "../hooks/useAgent.js";
import { useArgs } from "../hooks/useArgs.js";
import { useHeight } from "../hooks/useHeight.js";
import { useUserInput } from "../hooks/useUserInput.js";

import { Header, Content, Footer, type Message, type ToolApprovalInfo } from "./layout";

// Re-export AgentStatus for convenience
export type { AgentStatus } from "../hooks/useAgent.js";

export const Agent = () => {
  const { exit } = useApp();

  useHeight();

  const { useAutoElementHeight, useInitTerminalHeight } = useHeight.getActions();

  const { columns, rows } = useInitTerminalHeight();

  useAutoElementHeight();

  // Get config from useArgs hook (reactive selector)
  const config = useArgs((s) => s.config);
  const { model, rootPath, initialPrompt } = config;

  // Get agent state (reactive)
  const status = useAgent((s) => s.status);
  const currentResponse = useAgent((s) => s.currentResponse);
  const currentReasoning = useAgent((s) => s.currentReasoning);
  const steps = useAgent((s) => s.steps);
  const currentStep = useAgent((s) => s.currentStep);
  const error = useAgent((s) => s.error);
  const result = useAgent((s) => s.result);
  const activeToolCalls = useAgent((s) => s.activeToolCalls);
  const completedToolCalls = useAgent((s) => s.completedToolCalls);
  const pendingApproval = useAgent((s) => s.pendingApproval);

  // Get actions (non-reactive)
  const agentActions = useAgent.getActions();
  const inputActions = useUserInput.getActions();

  // Terminal dimensions
  // const terminalHeight = stdout?.rows ?? 24;

  // Messages for Content component
  const messages = useMemo<Message[]>(() => {
    const msgs: Message[] = [];

    // Add messages from completed steps
    for (const step of steps) {
      if (step.text) {
        msgs.push({ role: "assistant", content: step.text });
      }
    }

    return msgs;
  }, [steps]);

  // Initialize agent on mount
  useEffect(() => {
    agentActions.initAgent();

    return () => {
      agentActions.destroy();
    };
  }, []);

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
  useInput((inputChar, key) => {
    // Handle approval input
    if (status === "waiting_approval" && pendingApproval) {
      if (inputChar === "y" || inputChar === "Y") {
        agentActions.approveToolCall();
        return;
      }
      if (inputChar === "n" || inputChar === "N") {
        agentActions.rejectToolCall("User denied the operation");
        return;
      }
      return;
    }

    // Normal input handling
    if (status === "running" || status === "initializing") return;

    if (key.ctrl && inputChar === "c") {
      agentActions.destroy();
      exit();
      return;
    }

    if (key.escape) {
      agentActions.destroy();
      exit();
      return;
    }

    if (key.return) {
      handleSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      inputActions.backspace();
      return;
    }

    // History navigation
    if (key.upArrow) {
      inputActions.historyPrev();
      return;
    }

    if (key.downArrow) {
      inputActions.historyNext();
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      inputActions.append(inputChar);
    }
  });

  // Prepare approval info for Content
  const approvalInfo: ToolApprovalInfo | undefined = pendingApproval
    ? { toolCall: pendingApproval.toolCall }
    : undefined;

  // Calculate usage
  const usage = result?.usage
    ? {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      }
    : undefined;

  return (
    <Box flexDirection="column" height={rows} width={columns}>
      {/* Header - Fixed at top */}
      <Header model={model} path={rootPath} />

      {/* Content - Flexible, takes remaining space */}
      <Content
        messages={messages}
        currentResponse={currentResponse}
        currentReasoning={currentReasoning}
        activeToolCalls={activeToolCalls}
        completedToolCalls={completedToolCalls}
        pendingApproval={approvalInfo}
        isRunning={status === "running"}
      />

      {/* Footer - Fixed at bottom */}
      <Footer
        status={status}
        usage={usage}
        currentStep={currentStep}
        totalSteps={steps.length > 0 ? steps.length : undefined}
        error={error}
      />
    </Box>
  );
};
