import { Box, Text } from "ink";

import { useArgs } from "../hooks";

export const Help = () => {
  const config = useArgs.useDeepSelector((s) => s.config);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          my-agent
        </Text>
        <Text> - AI-powered coding assistant</Text>
      </Box>

      {/* Usage */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          USAGE
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text>my-agent [options] [prompt]</Text>
          <Text>my-agent -h, --help</Text>
        </Box>
      </Box>

      {/* Options */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          OPTIONS
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={24}>
              <Text color="green">-m, --model</Text>
            </Box>
            <Text>Model name (default: qwen2.5-coder:7b)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color="green">-u, --url</Text>
            </Box>
            <Text>Ollama server URL (default: http://localhost:11434)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color="green">-p, --path</Text>
            </Box>
            <Text>Working directory (default: current directory)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color="green">--provider</Text>
            </Box>
            <Text>LLM provider: ollama | openRouter</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color="green">-k, --api-key</Text>
            </Box>
            <Text>API key for OpenRouter</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color="green">--max-iterations</Text>
            </Box>
            <Text>Max agent loop iterations (default: 20)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color="green">-d, --debug</Text>
            </Box>
            <Text>Enable debug logging</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color="green">-h, --help</Text>
            </Box>
            <Text>Show this help message</Text>
          </Box>
        </Box>
      </Box>

      {/* Environment Variables */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          ENVIRONMENT (.env)
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Text color="gray">Create a .env file in your project root:</Text>
          <Box flexDirection="column" paddingLeft={2} marginTop={1}>
            <Text color="cyan">provider=openRouter</Text>
            <Text color="cyan">model=anthropic/claude-3.5-sonnet</Text>
            <Text color="cyan">apiKey=sk-or-v1-xxx</Text>
            <Text color="cyan">maxIterations=30</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">
              Priority: CLI args {">"} env vars {">"} defaults
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Current Config */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          CURRENT CONFIG
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={14}>
              <Text color="cyan">provider:</Text>
            </Box>
            <Text>{config.provider}</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color="cyan">model:</Text>
            </Box>
            <Text>{config.model}</Text>
          </Box>
          {config.provider === "ollama" && (
            <Box>
              <Box width={14}>
                <Text color="cyan">url:</Text>
              </Box>
              <Text>{config.url}</Text>
            </Box>
          )}
          {config.provider === "openRouter" && (
            <Box>
              <Box width={14}>
                <Text color="cyan">apiKey:</Text>
              </Box>
              <Text>{config.apiKey ? `${config.apiKey.slice(0, 12)}...` : "(not set)"}</Text>
            </Box>
          )}
          <Box>
            <Box width={14}>
              <Text color="cyan">path:</Text>
            </Box>
            <Text>{config.rootPath}</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color="cyan">maxIterations:</Text>
            </Box>
            <Text>{config.maxIterations}</Text>
          </Box>
        </Box>
      </Box>

      {/* Examples */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          EXAMPLES
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Text color="gray">$ my-agent "Create a hello world function"</Text>
          <Text color="gray">$ my-agent -p ./my-project "Fix the bug in main.ts"</Text>
          <Text color="gray">$ my-agent --provider openRouter -m anthropic/claude-3.5-sonnet "Review code"</Text>
        </Box>
      </Box>

      {/* Keyboard */}
      <Box flexDirection="column">
        <Text bold color="yellow">
          KEYBOARD
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={14}>
              <Text color="green">Enter</Text>
            </Box>
            <Text>Submit prompt</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color="green">Y / N</Text>
            </Box>
            <Text>Approve / Deny tool execution</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color="green">Ctrl+C / Esc</Text>
            </Box>
            <Text>Exit</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
