import { getEnv } from "@my-agent/core";
import { Box, Text } from "ink";

import { useConfig } from "../hooks/use-config.js";
import { COLORS } from "../theme/colors.js";

export const Help = () => {
  const config = useConfig((s) => s.config);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={COLORS.primary}>
          my-agent
        </Text>
        <Text> - AI-powered coding assistant</Text>
      </Box>

      {/* Usage */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={COLORS.warning}>
          USAGE
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text>my-agent [options] [prompt]</Text>
          <Text>my-agent -h, --help</Text>
        </Box>
      </Box>

      {/* Options */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={COLORS.warning}>
          OPTIONS
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>-m, --model</Text>
            </Box>
            <Text>Model name (default: qwen2.5-coder:7b)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>-u, --url</Text>
            </Box>
            <Text>Ollama server URL (default: http://localhost:11434)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>--provider</Text>
            </Box>
            <Text>LLM provider: ollama | openRouter | openaiCompatible | deepseek</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>-k, --api-key</Text>
            </Box>
            <Text>API key for the provider</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>--max-iterations</Text>
            </Box>
            <Text>Max agent loop iterations (default: 50)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>-R, --remote</Text>
            </Box>
            <Text>Remote CoreEnv server URL</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>-d, --debug</Text>
            </Box>
            <Text>Enable debug logging</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>-h, --help</Text>
            </Box>
            <Text>Show this help message</Text>
          </Box>
        </Box>
      </Box>

      {/* Environment Variables */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={COLORS.warning}>
          ENVIRONMENT (.env)
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Text color={COLORS.muted}>Create a .env file in your project root:</Text>
          <Box flexDirection="column" paddingLeft={2} marginTop={1}>
            <Text color={COLORS.primary}>provider=openRouter</Text>
            <Text color={COLORS.primary}>model=anthropic/claude-3.5-sonnet</Text>
            <Text color={COLORS.primary}>apiKey=sk-or-v1-xxx</Text>
            <Text color={COLORS.primary}>maxIterations=30</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={COLORS.muted}>
              Priority: CLI args {">"} env vars {">"} defaults
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Current Config */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={COLORS.warning}>
          CURRENT CONFIG
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={14}>
              <Text color={COLORS.primary}>provider:</Text>
            </Box>
            <Text>{config.provider}</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color={COLORS.primary}>model:</Text>
            </Box>
            <Text>{config.model}</Text>
          </Box>
          {config.provider === "ollama" && (
            <Box>
              <Box width={14}>
                <Text color={COLORS.primary}>url:</Text>
              </Box>
              <Text>{config.url}</Text>
            </Box>
          )}
          {config.provider === "openRouter" && (
            <Box>
              <Box width={14}>
                <Text color={COLORS.primary}>apiKey:</Text>
              </Box>
              <Text>{config.apiKey ? `${config.apiKey.slice(0, 12)}...` : "(not set)"}</Text>
            </Box>
          )}
          <Box>
            <Box width={14}>
              <Text color={COLORS.primary}>path:</Text>
            </Box>
            <Text>{getEnv().rootPath}</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color={COLORS.primary}>maxIterations:</Text>
            </Box>
            <Text>{config.maxIterations}</Text>
          </Box>
        </Box>
      </Box>

      {/* Examples */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={COLORS.warning}>
          EXAMPLES
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Text color={COLORS.muted}>{'$ my-agent "Create a hello world function"'}</Text>
          <Text color={COLORS.muted}>
            {'$ my-agent --provider openRouter -m anthropic/claude-3.5-sonnet "Review code"'}
          </Text>
          <Text color={COLORS.muted}>{'$ my-agent --remote http://localhost:3100 "Fix the bug"'}</Text>
        </Box>
      </Box>

      {/* Keyboard */}
      <Box flexDirection="column">
        <Text bold color={COLORS.warning}>
          KEYBOARD
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={14}>
              <Text color={COLORS.success}>Enter</Text>
            </Box>
            <Text>Submit prompt</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color={COLORS.success}>Y / N</Text>
            </Box>
            <Text>Approve / Deny tool execution</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color={COLORS.success}>Ctrl+C / Esc</Text>
            </Box>
            <Text>Exit</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
