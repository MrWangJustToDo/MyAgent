import { Box, Text } from "ink";

import { useArgs } from "../hooks";

export const Help = () => {
  const currentOptions = useArgs.useDeepSelector((s) => s.config);

  const hasOptions =
    currentOptions &&
    (currentOptions.url || currentOptions.model || currentOptions.rootPath || currentOptions.systemPrompt);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          my-agent
        </Text>
        <Text> - AI-powered coding agent using Ollama</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          Usage:
        </Text>
        <Text> my-agent [options] {"<prompt>"}</Text>
        <Text> my-agent -h</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          Options:
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={20}>
              <Text color="green">-m, --model</Text>
            </Box>
            <Text>Model to use (default: qwen2.5-coder:7b)</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">-u, --url</Text>
            </Box>
            <Text>Ollama server URL (default: http://localhost:11434)</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">-p, --path</Text>
            </Box>
            <Text>Working directory for file operations (default: cwd)</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">-s, --system</Text>
            </Box>
            <Text>Custom system prompt for the agent</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">-h, --help</Text>
            </Box>
            <Text>Show this help message</Text>
          </Box>
        </Box>
      </Box>

      {/* Show current options if any are set */}
      {hasOptions && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">
            Current Options:
          </Text>
          <Box flexDirection="column" paddingLeft={2}>
            {currentOptions.url && (
              <Box>
                <Box width={12}>
                  <Text color="cyan">url:</Text>
                </Box>
                <Text>{currentOptions.url}</Text>
              </Box>
            )}
            {currentOptions.model && (
              <Box>
                <Box width={12}>
                  <Text color="cyan">model:</Text>
                </Box>
                <Text>{currentOptions.model}</Text>
              </Box>
            )}
            {currentOptions.rootPath && (
              <Box>
                <Box width={12}>
                  <Text color="cyan">path:</Text>
                </Box>
                <Text>{currentOptions.rootPath}</Text>
              </Box>
            )}
            {currentOptions.systemPrompt && (
              <Box>
                <Box width={12}>
                  <Text color="cyan">system:</Text>
                </Box>
                <Text>{currentOptions.systemPrompt}</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          Examples:
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Text color="gray">$ my-agent "Create a hello world function in TypeScript"</Text>
          <Text color="gray">$ my-agent -p ./my-project "Fix the bug in main.ts"</Text>
          <Text color="gray">$ my-agent -m codellama "Refactor the utils folder"</Text>
          <Text color="gray">$ my-agent -m llama3.2 -h</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          Available Tools:
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Text color="cyan">File Operations: </Text>
            <Text color="gray">read, write, edit, delete, copy, move, list</Text>
          </Box>
          <Box>
            <Text color="cyan">Search: </Text>
            <Text color="gray">glob, grep, tree</Text>
          </Box>
          <Box>
            <Text color="cyan">Commands: </Text>
            <Text color="gray">run_command, list_command, man_command</Text>
          </Box>
          <Box>
            <Text color="cyan">Other: </Text>
            <Text color="gray">fetch_url, search_replace</Text>
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text bold color="yellow">
          Keyboard:
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Text color="gray">Enter - Submit prompt</Text>
          <Text color="gray">Y/N - Approve/Deny tool execution</Text>
          <Text color="gray">Ctrl+C / Esc - Exit</Text>
        </Box>
      </Box>
    </Box>
  );
};
