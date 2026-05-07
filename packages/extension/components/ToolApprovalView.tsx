import { Button, Chip } from "@heroui/react";
import { getToolName } from "ai";
import { ShieldAlertIcon } from "lucide-react";

import type { ToolUIPart } from "ai";

interface ToolApprovalViewProps {
  part: ToolUIPart;
  onApprove: () => void;
  onDeny: () => void;
}

export const ToolApprovalView = ({ part, onApprove, onDeny }: ToolApprovalViewProps) => {
  const toolName = getToolName(part);

  return (
    <div className="border-warning-200 bg-warning-50 mb-1 rounded border p-2 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5">
        <ShieldAlertIcon className="text-warning h-3.5 w-3.5" />
        <span className="text-warning-700 font-medium">Approval Required</span>
        <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">
          {toolName}
        </Chip>
      </div>
      {part.input !== undefined && (
        <pre className="bg-default-100 mb-2 max-h-24 overflow-auto rounded p-1.5 text-[10px] break-all whitespace-pre-wrap">
          {JSON.stringify(part.input, null, 2)}
        </pre>
      )}
      <div className="flex gap-2">
        <Button size="sm" color="success" variant="flat" onPress={onApprove} className="h-6 min-w-0 text-xs">
          Approve
        </Button>
        <Button size="sm" color="danger" variant="flat" onPress={onDeny} className="h-6 min-w-0 text-xs">
          Deny
        </Button>
      </div>
    </div>
  );
};
