import { TitledBox } from "@mishieck/ink-titled-box";
import { Box, Text, useInput } from "ink";

import { useApprovalState } from "../hooks/useApprovalState.js";
import { formatToolArgs } from "../utils/format.js";

import type { ApprovalDecision } from "../hooks/useApprovalState.js";
import type { ToolRenderPart } from "@my-agent/core";

// ============================================================================
// Sub Components
// ============================================================================

/** Decision badge */
const Badge = ({ decision }: { decision: ApprovalDecision }) => {
  const config = {
    approve: { color: "green", text: "[APPROVE]" },
    reject: { color: "red", text: "[REJECT]" },
    pending: { color: "yellow", text: "[PENDING]" },
  }[decision];

  return <Text color={config.color as "green" | "red" | "yellow"}> {config.text} </Text>;
};

/** Tool detail view */
const ToolDetail = ({ tool, decision }: { tool: ToolRenderPart; decision: ApprovalDecision }) => (
  <Box flexDirection="column" paddingX={1}>
    <Box>
      <Text color="cyan" bold>
        Tool:{" "}
      </Text>
      <Text>{tool.name}</Text>
      <Badge decision={decision} />
    </Box>
    <Box marginTop={1} flexDirection="column">
      <Text color="gray" dimColor>
        Arguments:
      </Text>
      <Box paddingLeft={1}>
        <Text color="gray">{formatToolArgs(tool.input)}</Text>
      </Box>
    </Box>
  </Box>
);

/** Summary bar */
const Summary = ({ approved, rejected, pending }: { approved: number; rejected: number; pending: number }) => (
  <Box marginTop={1} paddingX={1}>
    <Text color="gray">Summary: </Text>
    <Text color="green">{approved} approve</Text>
    <Text color="gray"> | </Text>
    <Text color="red">{rejected} reject</Text>
    <Text color="gray"> | </Text>
    <Text color="yellow">{pending} pending</Text>
  </Box>
);

/** Keyboard shortcuts help */
const Shortcuts = ({ hasMultiple, canSubmit }: { hasMultiple: boolean; canSubmit: boolean }) => (
  <Box flexDirection="column" marginTop={1} paddingX={1}>
    <Text color="gray" dimColor>
      Shortcuts:
    </Text>
    <Box paddingLeft={1} flexDirection="column">
      <Text color="green">
        Y <Text color="gray">- Approve</Text>
      </Text>
      <Text color="red">
        N <Text color="gray">- Reject</Text>
      </Text>
      <Text color="yellow">
        U <Text color="gray">- Undo</Text>
      </Text>
      {hasMultiple && (
        <>
          <Text color="green">
            A <Text color="gray">- Approve all</Text>
          </Text>
          <Text color="red">
            R <Text color="gray">- Reject all</Text>
          </Text>
          <Text color="yellow">
            C <Text color="gray">- Clear all</Text>
          </Text>
          <Text color="cyan">
            Arrow <Text color="gray">- Switch tools</Text>
          </Text>
        </>
      )}
      <Text color={canSubmit ? "magenta" : "gray"} bold={canSubmit}>
        Enter <Text color="gray">- Submit{!canSubmit && " (decide all first)"}</Text>
      </Text>
    </Box>
  </Box>
);

// ============================================================================
// Main Component
// ============================================================================

export const UserApprove = () => {
  const [state, actions] = useApprovalState();
  const { tools, currentTool, currentDecision, canSubmit, pendingCount, approvedCount, rejectedCount } = state;

  // Keyboard input
  useInput((input, key) => {
    if (tools.length === 0) return;

    const upper = input.toUpperCase();

    // Single tool actions
    if (upper === "Y") {
      actions.decide("approve");
      actions.selectNext();
    } else if (upper === "N") {
      actions.decide("reject");
      actions.selectNext();
    } else if (upper === "U") actions.decide("pending");
    // Batch actions
    else if (upper === "A") actions.decideAll("approve");
    else if (upper === "R") actions.decideAll("reject");
    else if (upper === "C") actions.decideAll("pending");
    // Navigation
    else if (key.leftArrow) actions.selectPrev();
    else if (key.rightArrow) actions.selectNext();
    // Submit
    else if (key.return && canSubmit) actions.submit();
  });

  if (tools.length === 0) return null;

  const hasMultiple = tools.length > 1;

  return (
    <TitledBox titles={["Tool Approval Required"]} borderStyle="round" borderColor="yellow">
      <Box flexDirection="column">
        {/* Tool tabs */}
        {hasMultiple && (
          <Box marginBottom={1} gap={1}>
            {tools.map((tool) => {
              const d = actions.getDecision(tool.id);
              const icon = d === "approve" ? " v" : d === "reject" ? " x" : "";
              const color = d === "approve" ? "green" : d === "reject" ? "red" : "yellow";
              const isSelected = tool.id === currentTool?.id;

              return (
                <Box key={tool.id}>
                  <Text color={color as "green" | "red" | "yellow"} inverse={isSelected}>
                    {" "}
                    {tool.name}
                    {icon}{" "}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Current tool detail */}
        {currentTool && <ToolDetail tool={currentTool} decision={currentDecision} />}

        {/* Summary */}
        {hasMultiple && <Summary approved={approvedCount} rejected={rejectedCount} pending={pendingCount} />}

        {/* Ready prompt */}
        {canSubmit && (
          <Box marginTop={1} paddingX={1} borderStyle="round" borderColor="magenta">
            <Text color="magenta" bold>
              Ready! Press Enter to submit.
            </Text>
          </Box>
        )}

        {/* Help */}
        <Shortcuts hasMultiple={hasMultiple} canSubmit={canSubmit} />
      </Box>
    </TitledBox>
  );
};
