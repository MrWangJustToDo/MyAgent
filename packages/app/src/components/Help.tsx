import { DEFAULT_BASE_URLS, DEFAULT_LOCAL_OPENAI_BASE_URL, getEnv } from "@my-agent/core";
import { Box, Text } from "ink";

import { useConfig } from "../hooks/use-config.js";
import { COLORS } from "../theme/colors.js";
import {
  approveDenyLabel,
  exitAbortLabel,
  followUpEnterLabel,
  KeyLabel,
  newlineEnterLabel,
} from "../utils/keyboard-labels.js";

export const Help = () => {
  const config = useConfig((s) => s.config);
  const modifiedEnter = followUpEnterLabel();
  const newlineChord = newlineEnterLabel();
  const yn = approveDenyLabel();
  const exitAbort = exitAbortLabel();

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
            <Text>Model name (required — set via MODEL env or --model)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>--style</Text>
            </Box>
            <Text>API style: openai | anthropic (default: openai)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>-u, --url</Text>
            </Box>
            <Text>Base URL alias for --base-url (OpenAI-compatible default: {DEFAULT_LOCAL_OPENAI_BASE_URL})</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>--base-url</Text>
            </Box>
            <Text>API base URL (defaults per style when unset)</Text>
          </Box>
          <Box>
            <Box width={24}>
              <Text color={COLORS.success}>-k, --api-key</Text>
            </Box>
            <Text>API key (required for anthropic style)</Text>
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
            <Text color={COLORS.primary}>MODEL_STYLE=openai</Text>
            <Text color={COLORS.primary}>MODEL=anthropic/claude-3.5-sonnet</Text>
            <Text color={COLORS.primary}>BASE_URL=https://openrouter.ai/api/v1</Text>
            <Text color={COLORS.primary}>API_KEY=sk-or-v1-xxx</Text>
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
              <Text color={COLORS.primary}>style:</Text>
            </Box>
            <Text>{config.style}</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color={COLORS.primary}>model:</Text>
            </Box>
            <Text>{config.model}</Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text color={COLORS.primary}>baseURL:</Text>
            </Box>
            <Text>{config.baseURL || DEFAULT_BASE_URLS[config.style]}</Text>
          </Box>
          {config.apiKey && (
            <Box>
              <Box width={14}>
                <Text color={COLORS.primary}>apiKey:</Text>
              </Box>
              <Text>{`${config.apiKey.slice(0, 12)}...`}</Text>
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
            {
              '$ my-agent --style openai --base-url https://openrouter.ai/api/v1 -m anthropic/claude-3.5-sonnet -k sk-or-... "Review code"'
            }
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
            <Box width={28}>
              <Text color={COLORS.success}>{KeyLabel.enter}</Text>
            </Box>
            <Text>Submit prompt (while running: queue steer)</Text>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={COLORS.success}>{newlineChord}</Text>
            </Box>
            <Text>Insert newline when idle</Text>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={COLORS.success}>{modifiedEnter}</Text>
            </Box>
            <Text>Queue follow-up while running</Text>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={COLORS.success}>{yn}</Text>
            </Box>
            <Text>Approve / Deny tool execution</Text>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={COLORS.success}>{exitAbort}</Text>
            </Box>
            <Text>Exit / abort</Text>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={COLORS.success}>/plan</Text>
            </Box>
            <Text>Toggle plan mode (read-only planning)</Text>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={COLORS.success}>/plan execute</Text>
            </Box>
            <Text>Run an approved plan</Text>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={COLORS.success}>/plan cancel</Text>
            </Box>
            <Text>Pause execution (back to ready, read-only)</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
