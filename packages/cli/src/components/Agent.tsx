import {
  createAgent,
  DEFAULT_OLLAMA_URL,
  type Agent as AgentInstance,
  type AgentStepInfo,
  type ToolCallInfo,
  type AgentRunResult,
} from "@my-agent/core";
import { Box, Text, useApp, useInput } from "ink";
import { useState, useCallback, useEffect, useRef } from "react";

import { parseArgs, getFlagString } from "../hooks/useArgs.js";
import { Markdown } from "../markdown";

import { Spinner } from "./Spinner.js";

export interface AgentProps {
  args: string[];
}

type AgentStatus = "idle" | "initializing" | "running" | "waiting_approval" | "completed" | "error";

interface PendingApproval {
  toolCall: ToolCallInfo;
  resolve: (approved: boolean, reason?: string) => void;
}

export const Agent = ({ args }: AgentProps) => {
  const { exit } = useApp();
  const parsed = parseArgs(args);

  // Configuration
  const url = getFlagString(parsed, DEFAULT_OLLAMA_URL, "url", "u");
  const model = getFlagString(parsed, "qwen2.5-coder:7b", "model", "m");
  const systemPrompt = getFlagString(
    parsed,
    "You are a helpful coding assistant. You can read, write, and modify files, run commands, and help with programming tasks.",
    "system",
    "s"
  );
  const rootPath = getFlagString(parsed, process.cwd(), "path", "p");
  const initialPrompt = parsed.positional.join(" ");

  // State
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [input, setInput] = useState(initialPrompt);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [steps, setSteps] = useState<AgentStepInfo[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallInfo[]>([]);
  const [completedToolCalls, setCompletedToolCalls] = useState<ToolCallInfo[]>([]);

  const agentRef = useRef<AgentInstance | null>(null);

  // Initialize agent on mount
  useEffect(() => {
    const initAgent = async () => {
      setStatus("initializing");
      try {
        const agent = await createAgent({
          model,
          baseURL: `${url}/v1/`,
          systemPrompt,
          rootPath,
          maxSteps: 20,
        });
        agentRef.current = agent;
        setStatus("idle");

        // Auto-run if initial prompt provided
        if (initialPrompt.trim()) {
          handleSubmit(initialPrompt.trim());
        }
      } catch (err) {
        setError(`Failed to initialize agent: ${(err as Error).message}`);
        setStatus("error");
      }
    };

    initAgent();

    return () => {
      agentRef.current?.destroy();
    };
  }, []);

  const handleSubmit = useCallback(
    async (prompt?: string) => {
      const taskPrompt = prompt ?? input.trim();
      if (!taskPrompt || status === "running" || !agentRef.current) return;

      setInput("");
      setStatus("running");
      setCurrentResponse("");
      setCurrentReasoning("");
      setSteps([]);
      setCurrentStep(0);
      setError("");
      setResult(null);
      setActiveToolCalls([]);
      setCompletedToolCalls([]);

      // Add user message to history
      setHistory((prev) => [...prev, { role: "user", content: taskPrompt }]);

      try {
        const runResult = await agentRef.current.run({
          prompt: taskPrompt,
          stream: true,
          onToken: (token) => {
            setCurrentResponse((prev) => prev + token);
          },
          onReasoning: (token) => {
            setCurrentReasoning((prev) => prev + token);
          },
          onStepStart: (stepNumber) => {
            setCurrentStep(stepNumber);
          },
          onStepFinish: (step) => {
            setSteps((prev) => [...prev, step]);
            // Clear streaming content and tool calls when step finishes
            setCurrentResponse("");
            setCurrentReasoning("");
            setActiveToolCalls([]);
            setCompletedToolCalls([]);
          },
          onToolApproval: async (toolCall) => {
            return new Promise((resolve) => {
              setPendingApproval({
                toolCall,
                resolve: (approved, reason) => {
                  setPendingApproval(null);
                  resolve({
                    toolCallId: toolCall.toolCallId,
                    approved,
                    reason,
                  });
                },
              });
              setStatus("waiting_approval");
            });
          },
          onToolCallStart: (toolCall) => {
            setActiveToolCalls((prev) => [...prev, toolCall]);
          },
          onToolCallFinish: (toolCall, _result) => {
            setActiveToolCalls((prev) => prev.filter((tc) => tc.toolCallId !== toolCall.toolCallId));
            setCompletedToolCalls((prev) => [...prev, toolCall]);
          },
          onError: (err) => {
            setError(err.message);
            setStatus("error");
          },
        });

        setResult(runResult);
        setHistory((prev) => [...prev, { role: "assistant", content: runResult.text }]);
        setStatus("completed");
      } catch (err) {
        setError((err as Error).message);
        setStatus("error");
      }
    },
    [input, status]
  );

  // Handle input
  useInput((inputChar, key) => {
    // Handle approval input
    if (status === "waiting_approval" && pendingApproval) {
      if (inputChar === "y" || inputChar === "Y") {
        pendingApproval.resolve(true);
        setStatus("running");
        return;
      }
      if (inputChar === "n" || inputChar === "N") {
        pendingApproval.resolve(false, "User denied the operation");
        setStatus("running");
        return;
      }
      return;
    }

    // Normal input handling
    if (status === "running" || status === "initializing") return;

    if (key.ctrl && inputChar === "c") {
      agentRef.current?.destroy();
      exit();
      return;
    }

    if (key.escape) {
      agentRef.current?.destroy();
      exit();
      return;
    }

    if (key.return) {
      handleSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      setInput((prev) => prev + inputChar);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text color="cyan" bold>
            My Agent
          </Text>
          <Text color="gray"> - Model: </Text>
          <Text color="yellow">{model}</Text>
          <Text color="gray"> - Path: </Text>
          <Text color="blue">{rootPath}</Text>
        </Box>
        <Text color="gray" dimColor>
          Type your task and press Enter. Press Ctrl+C or Esc to exit.
        </Text>
      </Box>

      {/* Initializing */}
      {status === "initializing" && (
        <Box marginBottom={1}>
          <Spinner text="Initializing agent and sandbox..." />
        </Box>
      )}

      {/* History */}
      {history.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {history.map((msg, index) => (
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Text color={msg.role === "user" ? "green" : "cyan"} bold>
                {msg.role === "user" ? "You" : "Agent"}:
              </Text>
              <Box paddingLeft={2}>
                {msg.role === "assistant" ? <Markdown content={msg.content} /> : <Text wrap="wrap">{msg.content}</Text>}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Current Step Progress */}
      {status === "running" && currentStep > 0 && (
        <Box marginBottom={1}>
          <Text color="magenta">Step {currentStep}</Text>
        </Box>
      )}

      {/* Active Tool Calls */}
      {status === "running" && activeToolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {activeToolCalls.map((tc) => (
            <Box key={tc.toolCallId}>
              <Spinner text="" />
              <Text color="yellow"> {tc.toolName}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Completed Tool Calls (current step) */}
      {status === "running" && completedToolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {completedToolCalls.map((tc) => (
            <Box key={tc.toolCallId}>
              <Text color="green">✓</Text>
              <Text color="gray"> {tc.toolName}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Streaming Reasoning */}
      {status === "running" && currentReasoning && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta" dimColor italic>
            Thinking:
          </Text>
          <Box paddingLeft={2} borderStyle="round" borderColor="magenta" paddingX={1}>
            <Text color="gray" dimColor wrap="wrap">
              {currentReasoning}
            </Text>
          </Box>
        </Box>
      )}

      {/* Streaming Response */}
      {status === "running" && currentResponse && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan" bold>
            Agent:
          </Text>
          <Box paddingLeft={2}>
            <Markdown content={currentResponse + "▌"} />
          </Box>
        </Box>
      )}

      {/* Loading indicator */}
      {status === "running" && !currentResponse && !currentReasoning && (
        <Box marginBottom={1}>
          <Spinner text={`Processing step ${currentStep || 1}...`} />
        </Box>
      )}

      {/* Tool Approval Dialog */}
      {status === "waiting_approval" && pendingApproval && (
        <Box flexDirection="column" marginBottom={1} borderStyle="double" borderColor="yellow" padding={1}>
          <Text color="yellow" bold>
            Tool Approval Required
          </Text>
          <Box marginTop={1}>
            <Text>
              Tool: <Text color="cyan">{pendingApproval.toolCall.toolName}</Text>
            </Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Arguments:</Text>
            <Box paddingLeft={2}>
              <Text wrap="wrap">{JSON.stringify(pendingApproval.toolCall.args, null, 2)}</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text>
              Press{" "}
              <Text color="green" bold>
                Y
              </Text>{" "}
              to approve or{" "}
              <Text color="red" bold>
                N
              </Text>{" "}
              to deny
            </Text>
          </Box>
        </Box>
      )}

      {/* Completed Steps Summary */}
      {(status === "completed" || status === "idle") && steps.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray" dimColor>
            Completed in {steps.length} step{steps.length > 1 ? "s" : ""}
            {result?.usage && (
              <Text>
                {" "}
                | Tokens: {result.usage.inputTokens} in / {result.usage.outputTokens} out
              </Text>
            )}
          </Text>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Input */}
      {(status === "idle" || status === "completed" || status === "error") && (
        <Box>
          <Text color="green" bold>
            {">"}{" "}
          </Text>
          <Text>{input}</Text>
          <Text color="gray">▌</Text>
        </Box>
      )}
    </Box>
  );
};
