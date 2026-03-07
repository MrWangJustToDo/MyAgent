import { Box, Text } from "ink";

export const Help = () => {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          my-agent
        </Text>
        <Text> - AI-powered CLI using Ollama</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          Usage:
        </Text>
        <Text> my-agent {"<command>"} [options]</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          Commands:
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={20}>
              <Text color="green">translate, t</Text>
            </Box>
            <Text>Translate text to another language</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">chat, c</Text>
            </Box>
            <Text>Start an interactive chat session</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">models, m</Text>
            </Box>
            <Text>List available Ollama models</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">status, s</Text>
            </Box>
            <Text>Check Ollama server status</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">help, h</Text>
            </Box>
            <Text>Show this help message</Text>
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          Examples:
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Text color="gray">$ my-agent translate "Hello world" -t chinese</Text>
          <Text color="gray">$ my-agent chat -m llama3.2</Text>
          <Text color="gray">$ my-agent models</Text>
          <Text color="gray">$ my-agent status</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text bold color="yellow">
          Global Options:
        </Text>
        <Box flexDirection="column" paddingLeft={2}>
          <Box>
            <Box width={20}>
              <Text color="green">-u, --url</Text>
            </Box>
            <Text>Ollama server URL (default: http://localhost:11434)</Text>
          </Box>
          <Box>
            <Box width={20}>
              <Text color="green">-m, --model</Text>
            </Box>
            <Text>Model to use (default: llama3.2)</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
