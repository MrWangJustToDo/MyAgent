import { getModels, DEFAULT_OLLAMA_URL, type OllamaModel } from "@my-agent/core";
import { Box, Text, useApp } from "ink";
import { useState, useEffect } from "react";

import { parseArgs, getFlagString } from "../hooks/useArgs.js";

import { Spinner } from "./Spinner.js";

export interface ModelsProps {
  args: string[];
}

export const Models = ({ args }: ModelsProps) => {
  const { exit } = useApp();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [error, setError] = useState<string>("");

  const parsed = parseArgs(args);
  const url = getFlagString(parsed, DEFAULT_OLLAMA_URL, "url", "u");

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const result = await getModels(url);
        setModels(result);
        setStatus("success");
      } catch (err) {
        setError((err as Error).message);
        setStatus("error");
      }

      setTimeout(() => {
        exit();
      }, 100);
    };

    fetchModels();
  }, [url]);

  if (status === "loading") {
    return (
      <Box padding={1}>
        <Spinner text="Fetching models..." />
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box padding={1} flexDirection="column">
        <Box>
          <Text color="red">✗</Text>
          <Text> Failed to fetch models</Text>
        </Box>
        <Text color="gray">{error}</Text>
      </Box>
    );
  }

  if (models.length === 0) {
    return (
      <Box padding={1}>
        <Text color="yellow">No models found. Pull a model with: ollama pull llama3.2</Text>
      </Box>
    );
  }

  return (
    <Box padding={1} flexDirection="column">
      <Box marginBottom={1}>
        <Text color="green">✓</Text>
        <Text> Found </Text>
        <Text bold color="cyan">
          {models.length}
        </Text>
        <Text> models:</Text>
      </Box>

      <Box flexDirection="column">
        {models.map((model) => (
          <Box key={model.name}>
            <Box width={30}>
              <Text color="cyan">{model.name}</Text>
            </Box>
            <Text color="gray">{model.details.parameter_size}</Text>
            <Text color="gray"> · {model.details.family}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
