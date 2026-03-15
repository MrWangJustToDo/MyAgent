import { CodeView } from "@git-diff-view/cli";
import { Text } from "ink";
import { memo } from "react";

import { formatToolOutput } from "../utils/format";

import type { ToolCallPart, Tools, z } from "@my-agent/core";

const getLang = (name = "") => name.slice(name.lastIndexOf(".") + 1);

export const ToolOutputView = memo(
  ({ part }: { part: ToolCallPart }) => {
    if (part.name === "read-file-tool") {
      const content = part.output as z.infer<SplitUndefined<Tools["read_file"]["outputSchema"]>>;

      return (
        <CodeView
          data={{ fileName: content.path, fileLang: getLang(content.path), content: content.content }}
          codeViewTheme="dark"
          codeViewHighlight
        />
      );
    }

    return <Text color="gray">{formatToolOutput(part.output)}</Text>;
  },
  (p, c) => p.part.output === c.part.output
);

ToolOutputView.displayName = "ToolOutputView";
