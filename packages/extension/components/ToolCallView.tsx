import { Chip, Spinner } from "@heroui/react";
import { getToolName } from "ai";
import { CheckCircleIcon, XCircleIcon, WrenchIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { formatDuration, formatToolInput, formatToolOutput } from "@/utils/format";

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

  const inputSummary = formatToolInput(part.input, toolName);
  const outputObj = isDone && part.output !== undefined ? (part.output as Record<string, unknown>) : null;
  const durationMs = outputObj && typeof outputObj.durationMs === "number" ? outputObj.durationMs : null;
  const outputSummary = outputObj ? formatToolOutput(outputObj, toolName) : "";

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
        <span>
          <StatusIcon />
        </span>
        <Chip size="sm" variant="flat" className="h-5 text-[10px]">
          {toolName}
        </Chip>
        {inputSummary && <span className="text-default-500 min-w-0 truncate font-mono">{inputSummary}</span>}
        {durationMs !== null && (
          <span className="text-default-400 ml-auto shrink-0 text-[10px]">{formatDuration(durationMs)}</span>
        )}
        {expanded ? (
          <ChevronDownIcon className="text-default-400 h-3 w-3 shrink-0" />
        ) : (
          <ChevronRightIcon className="text-default-400 h-3 w-3 shrink-0" />
        )}
      </button>

      {!expanded && outputSummary && isDone && (
        <pre className="text-default-600 border-default-200 border-t px-2 py-1 text-[10px] whitespace-pre-wrap">
          {outputSummary}
        </pre>
      )}

      {expanded && (
        <div className="border-default-200 border-t px-2 py-1.5">
          {part.input !== undefined && (
            <div className="mb-1">
              <div className="text-default-500 mb-0.5 font-medium">Input</div>
              <pre className="bg-default-100 max-h-32 overflow-auto rounded p-1 font-mono text-[10px] break-all whitespace-pre-wrap">
                {inputSummary || JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {isDone && outputSummary && (
            <div>
              <div className="text-default-500 mb-0.5 font-medium">Output</div>
              <pre className="bg-default-100 max-h-48 overflow-auto rounded p-1 text-[10px] whitespace-pre-wrap">
                {outputSummary}
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
