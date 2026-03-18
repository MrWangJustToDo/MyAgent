// import { CodeView } from "@git-diff-view/cli";
import { Text } from "ink";
import { memo } from "react";

import { formatToolOutput } from "../utils/format";

import type { ToolInvocationUIPart } from "./ToolCallPartView";

// const getLang = (name = "") => name.slice(name.lastIndexOf(".") + 1);

export const ToolOutputViewDynamic = memo(
  ({ part }: { part: ToolInvocationUIPart }) => {
    // Check if output is available (state indicates completion)
    const hasOutput = part.state === "output-available" || part.state === "output-error";

    if (!hasOutput) return null;

    if (part.errorText) {
      return <Text color="red">{part.errorText}</Text>;
    }

    const toolName = part.toolName || part.type.slice(5);

    if (toolName === "read_file") {
      const content = part.output as { path?: string; content?: string; message?: string };
      if (content && typeof content === "object" && "content" in content) {
        return <Text color="gray">{content.message}</Text>;
        // return (
        //   <CodeView
        //     data={{
        //       fileName: content.path || "unknown",
        //       fileLang: getLang(content.path),
        //       content: content.content || "",
        //     }}
        //     codeViewTheme="dark"
        //     codeViewHighlight
        //   />
        // );
      }
    }

    return <Text color="gray">{formatToolOutput(part.output)}</Text>;
  },
  (p, c) => {
    const pOutput = p.part.output;
    const cOutput = c.part.output;
    return pOutput === cOutput;
  }
);

ToolOutputViewDynamic.displayName = "ToolOutputViewDynamic";
