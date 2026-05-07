import { Chip, Spinner } from "@heroui/react";
import { getToolName } from "ai";
import { CheckCircleIcon, XCircleIcon, WrenchIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import type { ToolUIPart } from "ai";

interface ToolCallViewProps {
  part: ToolUIPart;
}

const SpinnerEle = <Spinner size="sm" />;

export const ToolCallView = ({ part }: ToolCallViewProps) => {
  const [expanded, setExpanded] = useState(false);
  const toolName = getToolName(part);
  const isRunning = part.state === "input-streaming" || part.state === "input-available";
  const isDone = part.state === "output-available";
  const isError = part.state === "output-error" || part.state === "output-denied";

  const StatusIcon = () => {
    if (isRunning) return SpinnerEle;
    if (isDone) return <CheckCircleIcon className="text-success h-3.5 w-3.5" />;
    if (isError) return <XCircleIcon className="text-danger h-3.5 w-3.5" />;
    return <WrenchIcon className="text-default-400 h-3.5 w-3.5" />;
  };

  return (
    <div className="border-default-200 bg-default-50 mb-1 rounded border text-xs">
      <button
        className="hover:bg-default-100 flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon />
        <Chip size="sm" variant="flat" className="h-5 text-[10px]">
          {toolName}
        </Chip>
        {expanded ? (
          <ChevronDownIcon className="text-default-400 ml-auto h-3 w-3" />
        ) : (
          <ChevronRightIcon className="text-default-400 ml-auto h-3 w-3" />
        )}
      </button>
      {expanded && (
        <div className="border-default-200 border-t px-2 py-1.5">
          {part.input !== undefined && (
            <div className="mb-1">
              <div className="text-default-500 mb-0.5 font-medium">Input</div>
              <pre className="bg-default-100 max-h-32 overflow-auto rounded p-1 text-[10px] break-all whitespace-pre-wrap">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {isDone && part.output !== undefined && (
            <div>
              <div className="text-default-500 mb-0.5 font-medium">Output</div>
              <pre className="bg-default-100 max-h-32 overflow-auto rounded p-1 text-[10px] break-all whitespace-pre-wrap">
                {typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
          {part.state === "output-error" && part.errorText && (
            <div>
              <div className="text-danger mb-0.5 font-medium">Error</div>
              <pre className="bg-danger-50 text-danger max-h-32 overflow-auto rounded p-1 text-[10px] break-all whitespace-pre-wrap">
                {part.errorText}
              </pre>
            </div>
          )}
          {part.state === "output-denied" && (
            <div>
              <div className="text-danger mb-0.5 font-medium">Denied</div>
              <pre className="bg-danger-50 text-danger max-h-32 overflow-auto rounded p-1 text-[10px] break-all whitespace-pre-wrap">
                {part.approval?.reason ?? "Tool execution denied."}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
