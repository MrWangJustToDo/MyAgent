import { CodeView } from "@git-diff-view/cli";
import { Text } from "ink";
import { memo } from "react";

import { formatToolOutput } from "../utils/format";

import type { ToolInvocationUIPart } from "./ToolCallPartView.js";

const getLang = (name = "") => name.slice(name.lastIndexOf(".") + 1);

interface ToolOutputViewProps {
  /** Tool invocation part */
  part: ToolInvocationUIPart;
  /** Direct output override */
  output?: unknown;
}

export const ToolOutputView = memo(
  ({ part, output }: ToolOutputViewProps) => {
    // Get output from either direct prop or part.output
    const displayOutput = output ?? part.output;

    if (displayOutput === undefined) {
      return <Text color="gray">No output</Text>;
    }

    const toolName = part.toolName;

    if (toolName === "read-file-tool") {
      const content = displayOutput as { path?: string; content?: string };
      if (content && typeof content === "object" && "content" in content) {
        return (
          <CodeView
            data={{
              fileName: content.path || "unknown",
              fileLang: getLang(content.path),
              content: content.content || "",
            }}
            codeViewTheme="dark"
            codeViewHighlight
          />
        );
      }
    }

    return <Text color="gray">{formatToolOutput(displayOutput)}</Text>;
  },
  (p, c) => {
    const pOutput = p.output ?? p.part.output;
    const cOutput = c.output ?? c.part.output;
    return pOutput === cOutput;
  }
);

ToolOutputView.displayName = "ToolOutputView";
