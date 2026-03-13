import { TitledBox } from "@mishieck/ink-titled-box";
import { Box, Text, useInput } from "ink";
import { Tab, Tabs } from "ink-tab";
import { useCallback, useEffect, useState } from "react";

import { useAgent, useAgentContext } from "../hooks";

import type { ToolCall } from "../hooks";

// ============================================================================
// Types
// ============================================================================

type ApprovalDecision = "approve" | "reject" | "pending";

interface ToolDecision {
  tool: ToolCall;
  decision: ApprovalDecision;
}

// ============================================================================
// Helper Components
// ============================================================================

/** Format tool arguments for display */
const formatToolArgs = (args: Record<string, unknown>): string => {
  const entries = Object.entries(args);
  if (entries.length === 0) return "No arguments";

  return entries
    .map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      const truncated = strValue.length > 50 ? strValue.slice(0, 50) + "..." : strValue;
      return `  ${key}: ${truncated}`;
    })
    .join("\n");
};

/** Status badge for tool decision */
const DecisionBadge = ({ decision }: { decision: ApprovalDecision }) => {
  switch (decision) {
    case "approve":
      return <Text color="green"> [APPROVE] </Text>;
    case "reject":
      return <Text color="red"> [REJECT] </Text>;
    case "pending":
      return <Text color="yellow"> [PENDING] </Text>;
  }
};

/** Tool detail view */
const ToolDetailView = ({ tool, decision }: { tool: ToolCall; decision: ApprovalDecision }) => {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color="cyan" bold>
          Tool:{" "}
        </Text>
        <Text color="white">{tool.name}</Text>
        <DecisionBadge decision={decision} />
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Arguments:
        </Text>
      </Box>
      <Box paddingLeft={1}>
        <Text color="gray">{formatToolArgs(tool.args)}</Text>
      </Box>
    </Box>
  );
};

/** Help text for keyboard shortcuts */
const HelpText = ({ hasMultiple, canSubmit }: { hasMultiple: boolean; canSubmit: boolean }) => (
  <Box flexDirection="column" marginTop={1} paddingX={1}>
    <Text color="gray" dimColor>
      Shortcuts:
    </Text>
    <Box paddingLeft={1} flexDirection="column">
      <Text color="green">
        Y <Text color="gray">- Mark current tool as approve</Text>
      </Text>
      <Text color="red">
        N <Text color="gray">- Mark current tool as reject</Text>
      </Text>
      <Text color="yellow">
        U <Text color="gray">- Undo (reset to pending)</Text>
      </Text>
      {hasMultiple && (
        <>
          <Text color="green">
            A <Text color="gray">- Mark all as approve</Text>
          </Text>
          <Text color="red">
            R <Text color="gray">- Mark all as reject</Text>
          </Text>
          <Text color="yellow">
            C <Text color="gray">- Clear all (reset to pending)</Text>
          </Text>
        </>
      )}
      <Text color="cyan">
        Tab/Arrow <Text color="gray">- Switch between tools</Text>
      </Text>
      {canSubmit ? (
        <Text color="magenta" bold>
          Enter <Text color="gray">- Submit all decisions</Text>
        </Text>
      ) : (
        <Text color="gray" dimColor>
          Enter <Text color="gray">- Submit (mark all tools first)</Text>
        </Text>
      )}
    </Box>
  </Box>
);

/** Summary of decisions */
const DecisionSummary = ({ decisions }: { decisions: ToolDecision[] }) => {
  const approved = decisions.filter((d) => d.decision === "approve").length;
  const rejected = decisions.filter((d) => d.decision === "reject").length;
  const pending = decisions.filter((d) => d.decision === "pending").length;

  return (
    <Box marginTop={1} paddingX={1}>
      <Text color="gray">Summary: </Text>
      <Text color="green">{approved} approve</Text>
      <Text color="gray"> | </Text>
      <Text color="red">{rejected} reject</Text>
      <Text color="gray"> | </Text>
      <Text color="yellow">{pending} pending</Text>
    </Box>
  );
};

// ============================================================================
// Main Component
// ============================================================================
// Main Component
// ============================================================================

export const UserApprove = () => {
  const { context, allPending } = useAgentContext((s) => ({
    context: s.context,
    allPending: s.context?.getAllPendingApprove?.() ?? [],
  }));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Map<string, ApprovalDecision>>(new Map());
  // const [isSubmitted, setIsSubmitted] = useState(false);

  // Initialize decisions when pending tools change
  useEffect(() => {
    if (allPending.length > 0) {
      setDecisions((prev) => {
        const newDecisions = new Map<string, ApprovalDecision>();
        allPending.forEach((tool) => {
          // Preserve existing decisions
          newDecisions.set(tool.id, prev.get(tool.id) ?? "pending");
        });
        return newDecisions;
      });

      // Set initial selection if none
      setSelectedId((prev) => {
        if (!prev || !allPending.find((t) => t.id === prev)) {
          return allPending[0]?.id ?? null;
        }
        return prev;
      });
    }
  }, [allPending.length]);

  // Get current tool and decision
  const currentTool = allPending.find((t) => t.id === selectedId) ?? null;
  const currentDecision = selectedId ? (decisions.get(selectedId) ?? "pending") : "pending";

  // Build decisions array for summary
  const toolDecisions: ToolDecision[] = allPending.map((tool) => ({
    tool,
    decision: decisions.get(tool.id) ?? "pending",
  }));

  const pendingCount = toolDecisions.filter((d) => d.decision === "pending").length;
  const canSubmit = pendingCount === 0 && allPending.length > 0;

  // Toggle decision for a tool
  const setToolDecision = useCallback((toolId: string, decision: ApprovalDecision) => {
    setDecisions((prev) => new Map(prev).set(toolId, decision));
  }, []);

  // Move to next tool
  const selectNextTool = useCallback(() => {
    if (!selectedId || allPending.length <= 1) return;

    const currentIndex = allPending.findIndex((t) => t.id === selectedId);
    if (currentIndex !== -1 && currentIndex < allPending.length - 1) {
      setSelectedId(allPending[currentIndex + 1]?.id ?? null);
    }
  }, [selectedId, allPending]);

  // Submit all decisions
  const submitDecisions = useCallback(() => {
    if (!context || !canSubmit) return;

    toolDecisions.forEach(({ tool, decision }) => {
      if (decision === "approve") {
        context.approveTool(tool.id);
      } else if (decision === "reject") {
        context.rejectTool(tool.id, "User denied");
      }
    });

    // continue
    useAgent.getReadonlyState().current?.resume();
  }, [context, canSubmit, toolDecisions]);

  // Handle keyboard input
  useInput((input, key) => {
    if (!context || allPending.length === 0) return;

    const upperInput = input.toUpperCase();

    // Mark current tool as approve
    if (upperInput === "Y" && selectedId) {
      setToolDecision(selectedId, "approve");
      selectNextTool();
    }

    // Mark current tool as reject
    if (upperInput === "N" && selectedId) {
      setToolDecision(selectedId, "reject");
      selectNextTool();
    }

    // Undo current tool (reset to pending)
    if (upperInput === "U" && selectedId) {
      setToolDecision(selectedId, "pending");
    }

    // Mark all as approve
    if (upperInput === "A") {
      setDecisions((prev) => {
        const next = new Map(prev);
        allPending.forEach((tool) => {
          next.set(tool.id, "approve");
        });
        return next;
      });
    }

    // Mark all as reject
    if (upperInput === "R") {
      setDecisions((prev) => {
        const next = new Map(prev);
        allPending.forEach((tool) => {
          next.set(tool.id, "reject");
        });
        return next;
      });
    }

    // Clear all (reset to pending)
    if (upperInput === "C") {
      setDecisions((prev) => {
        const next = new Map(prev);
        allPending.forEach((tool) => {
          next.set(tool.id, "pending");
        });
        return next;
      });
    }

    // Navigate between tools with arrow keys
    if (key.leftArrow || key.rightArrow) {
      const currentIndex = allPending.findIndex((t) => t.id === selectedId);
      if (currentIndex !== -1) {
        const newIndex = key.leftArrow
          ? (currentIndex - 1 + allPending.length) % allPending.length
          : (currentIndex + 1) % allPending.length;
        setSelectedId(allPending[newIndex]?.id ?? null);
      }
    }

    // Submit all decisions with Enter
    if (key.return && canSubmit) {
      submitDecisions();
    }
  });

  // Early return if no pending tools
  if (!allPending.length) {
    return null;
  }

  // Show submitted state
  // if (isSubmitted) {
  //   return (
  //     <TitledBox titles={["Tool Approval"]} borderStyle="round" borderColor="green">
  //       <Box flexDirection="column" paddingX={1}>
  //         <Text color="green">All decisions submitted. Agent will continue...</Text>
  //         <Box marginTop={1} flexDirection="column">
  //           {toolDecisions.map(({ tool, decision }) => (
  //             <Box key={tool.id}>
  //               <Text color={decision === "approve" ? "green" : "red"}>
  //                 {decision === "approve" ? "✓" : "✗"} {tool.name}
  //               </Text>
  //             </Box>
  //           ))}
  //         </Box>
  //       </Box>
  //     </TitledBox>
  //   );
  // }

  return (
    <TitledBox titles={["Tool Approval Required"]} borderStyle="round" borderColor="yellow">
      <Box flexDirection="column">
        {/* Tool tabs for multiple tools */}
        {allPending.length > 1 && (
          <Box marginBottom={1}>
            <Tabs
              onChange={(id) => {
                setSelectedId(id);
              }}
            >
              {allPending.map((tool) => {
                const decision = decisions.get(tool.id) ?? "pending";
                const icon = decision === "approve" ? " ✓" : decision === "reject" ? " ✗" : "";
                const color = decision === "approve" ? "green" : decision === "reject" ? "red" : "yellow";

                return (
                  <Tab name={tool.id}>
                    <Text color={color}>
                      {tool.name}
                      {icon}
                    </Text>
                  </Tab>
                );
              })}
            </Tabs>
          </Box>
        )}

        {/* Tool details */}
        {currentTool && <ToolDetailView tool={currentTool} decision={currentDecision} />}

        {/* Summary for multiple tools */}
        {allPending.length > 1 && <DecisionSummary decisions={toolDecisions} />}

        {/* Submit prompt */}
        {canSubmit && (
          <Box marginTop={1} paddingX={1} borderStyle="round" borderColor="magenta">
            <Text color="magenta" bold>
              Ready to submit! Press Enter to confirm all decisions.
            </Text>
          </Box>
        )}

        {/* Help text */}
        <HelpText hasMultiple={allPending.length > 1} canSubmit={canSubmit} />
      </Box>
    </TitledBox>
  );
};
