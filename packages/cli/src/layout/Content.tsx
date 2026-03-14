import { Box, Text } from "ink";

import {
  TextPart,
  ReasoningPart,
  ToolPart,
  SourcePart,
  FilePart,
  StepPart,
  ErrorPart,
  UserPart,
} from "../components/parts";
import { useAgentContext } from "../hooks";
import { useSize } from "../hooks/useSize.js";

import type { RenderPart } from "@my-agent/core";

const empty: RenderPart[] = [];

// ============================================================================
// Part Renderer
// ============================================================================

/** Render a single part based on its type */
const PartView = ({ part }: { part: RenderPart }) => {
  switch (part.type) {
    case "user":
      return <UserPart part={part} />;
    case "text":
      return <TextPart part={part} />;
    case "reasoning":
      return <ReasoningPart part={part} />;
    case "tool":
      return <ToolPart part={part} />;
    case "source":
      return <SourcePart part={part} />;
    case "file":
      return <FilePart part={part} />;
    case "step":
      return <StepPart part={part} />;
    case "error":
      return <ErrorPart part={part} />;
    default:
      return null;
  }
};

// ============================================================================
// Main Component
// ============================================================================

export const Content = () => {
  // const height = useSize((s) => s.state.content);

  const parts =
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    (useAgentContext.useDeepStableSelector((s) => s.context?.parts as RenderPart[]) as RenderPart[]) || empty;

  return (
    <Box flexDirection="column">
      {/* Render all parts */}
      {parts.map((part, index) => (
        <Box key={`${part.type}-${index}`}>
          <PartView part={part} />
        </Box>
      ))}

      {/* Empty state */}
      {parts.length === 0 && (
        <Box>
          <Text color="gray" dimColor>
            No messages yet. Type a message to start.
          </Text>
        </Box>
      )}
    </Box>
  );
};
