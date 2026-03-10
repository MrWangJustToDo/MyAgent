import { createChat, DEFAULT_OLLAMA_URL } from "@my-agent/core";
import { Box, Text, useApp, useInput } from "ink";
import { useState, useCallback } from "react";

import { parseArgs, getFlagString } from "../hooks/useArgs.js";
import { Markdown } from "../markdown";

import { Spinner } from "./Spinner.js";

export interface ChatProps {
  args: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
}

export const Chat = ({ args }: ChatProps) => {
  const { exit } = useApp();
  const parsed = parseArgs(args);

  const url = getFlagString(parsed, DEFAULT_OLLAMA_URL, "url", "u");
  const model = getFlagString(parsed, "llama3.2", "model", "m");
  const systemPrompt = getFlagString(parsed, "", "system", "s");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [error, setError] = useState<string>("");
  const [chatSession] = useState(() => createChat(systemPrompt || undefined));

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsStreaming(true);
    setCurrentResponse("");
    setCurrentReasoning("");
    setError("");

    try {
      const baseURL = `${url}/v1/`;

      await chatSession.stream(userMessage, {
        model,
        baseURL,
        onToken: (token) => {
          setCurrentResponse((prev) => prev + token);
        },
        onReasoning: (token) => {
          setCurrentReasoning((prev) => prev + token);
        },
        onComplete: (text, reasoning) => {
          setMessages((prev) => [...prev, { role: "assistant", content: text, reasoning }]);
          setCurrentResponse("");
          setCurrentReasoning("");
          setIsStreaming(false);
        },
      });
    } catch (err) {
      setError((err as Error).message);
      setIsStreaming(false);
      setCurrentResponse("");
    }
  }, [input, isStreaming, url, model, chatSession]);

  useInput((inputChar, key) => {
    if (isStreaming) return;

    if (key.ctrl && inputChar === "c") {
      exit();
      return;
    }

    if (key.escape) {
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
            My Agent Chat
          </Text>
          <Text color="gray"> - Model: </Text>
          <Text color="yellow">{model}</Text>
        </Box>
        <Text color="gray" dimColor>
          Type your message and press Enter. Press Ctrl+C or Esc to exit.
        </Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, index) => (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={msg.role === "user" ? "green" : "cyan"} bold>
                {msg.role === "user" ? "You" : "Assistant"}:
              </Text>
            </Box>
            {/* Show reasoning/thinking content if available */}
            {msg.role === "assistant" && msg.reasoning && (
              <Box paddingLeft={2} flexDirection="column" marginBottom={1}>
                <Text color="magenta" dimColor italic>
                  Thinking:
                </Text>
                <Box paddingLeft={2} borderStyle="round" borderColor="magenta" paddingX={1}>
                  <Text color="gray" dimColor wrap="wrap">
                    {msg.reasoning}
                  </Text>
                </Box>
              </Box>
            )}
            <Box paddingLeft={2}>
              {msg.role === "assistant" ? <Markdown content={msg.content} /> : <Text wrap="wrap">{msg.content}</Text>}
            </Box>
          </Box>
        ))}

        {/* Streaming reasoning */}
        {isStreaming && currentReasoning && (
          <Box flexDirection="column" marginBottom={1}>
            <Box paddingLeft={2} flexDirection="column">
              <Text color="magenta" dimColor italic>
                Thinking:
              </Text>
              <Box paddingLeft={2} borderStyle="round" borderColor="magenta" paddingX={1}>
                <Text color="gray" dimColor wrap="wrap">
                  {currentReasoning + "▌"}
                </Text>
              </Box>
            </Box>
          </Box>
        )}

        {/* Streaming response */}
        {isStreaming && currentResponse && (
          <Box flexDirection="column" marginBottom={1}>
            <Box>
              <Text color="cyan" bold>
                Assistant:
              </Text>
            </Box>
            <Box paddingLeft={2}>
              <Markdown content={currentResponse + "▌"} />
            </Box>
          </Box>
        )}

        {/* Loading indicator */}
        {isStreaming && !currentResponse && !currentReasoning && (
          <Box>
            <Spinner text="Thinking..." />
          </Box>
        )}

        {/* Error */}
        {error && (
          <Box marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}
      </Box>

      {/* Input */}
      <Box>
        <Text color="green" bold>
          {">"}{" "}
        </Text>
        <Text>{input}</Text>
        {!isStreaming && <Text color="gray">▌</Text>}
      </Box>
    </Box>
  );
};
