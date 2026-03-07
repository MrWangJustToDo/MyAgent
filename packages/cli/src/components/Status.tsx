import { checkConnection, DEFAULT_OLLAMA_URL } from "@my-agent/core";
import { Box, Text, useApp } from "ink";
import { useState, useEffect } from "react";

import { parseArgs, getFlagString } from "../hooks/useArgs.js";

import { Spinner } from "./Spinner.js";

export interface StatusProps {
  args: string[];
}

export const Status = ({ args }: StatusProps) => {
  const { exit } = useApp();
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");

  const parsed = parseArgs(args);
  const url = getFlagString(parsed, DEFAULT_OLLAMA_URL, "url", "u");

  useEffect(() => {
    const check = async () => {
      try {
        const isConnected = await checkConnection(url);
        setStatus(isConnected ? "connected" : "disconnected");
      } catch {
        setStatus("disconnected");
      }

      setTimeout(() => {
        exit();
      }, 100);
    };

    check();
  }, [url]);

  if (status === "loading") {
    return (
      <Box padding={1}>
        <Spinner text={`Checking connection to ${url}...`} />
      </Box>
    );
  }

  if (status === "connected") {
    return (
      <Box padding={1}>
        <Text color="green">✓</Text>
        <Text> Ollama server is running at </Text>
        <Text color="cyan">{url}</Text>
      </Box>
    );
  }

  return (
    <Box padding={1}>
      <Text color="red">✗</Text>
      <Text> Cannot connect to Ollama server at </Text>
      <Text color="cyan">{url}</Text>
    </Box>
  );
};
