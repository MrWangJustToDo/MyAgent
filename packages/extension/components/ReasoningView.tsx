import { Spinner } from "@heroui/react";
import { BrainIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

interface ReasoningViewProps {
  text: string;
  isStreaming?: boolean;
}

export const ReasoningView = ({ text, isStreaming = false }: ReasoningViewProps) => {
  const [expanded, setExpanded] = useState(isStreaming);

  return (
    <div className="border-default-200 bg-default-50 mb-1 rounded border text-xs">
      <button
        className="hover:bg-default-100 flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {isStreaming ? <Spinner size="sm" /> : <BrainIcon className="text-default-400 h-3.5 w-3.5" />}
        <span className="text-default-500 italic">{isStreaming ? "Thinking..." : "Thought process"}</span>
        {expanded ? (
          <ChevronDownIcon className="text-default-400 ml-auto h-3 w-3" />
        ) : (
          <ChevronRightIcon className="text-default-400 ml-auto h-3 w-3" />
        )}
      </button>
      {expanded && (text || isStreaming) && (
        <div className="border-default-200 border-t px-2 py-1.5">
          <p className="text-default-500 max-h-48 overflow-auto whitespace-pre-wrap italic">
            {text}
            {isStreaming && <span className="bg-default-400 ml-0.5 inline-block h-3 w-1 animate-pulse align-middle" />}
          </p>
        </div>
      )}
    </div>
  );
};
