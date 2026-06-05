import { Button, Chip } from "@heroui/react";
import { getToolName } from "ai";
import { ShieldAlertIcon } from "lucide-react";
import { useState } from "react";

import { formatToolInput } from "@/utils/format";

import type { ToolUIPart } from "ai";

interface ToolApprovalViewProps {
  part: ToolUIPart;
  onApprove: () => void;
  onDeny: (reason?: string) => void;
}

export const ToolApprovalView = ({ part, onApprove, onDeny }: ToolApprovalViewProps) => {
  const toolName = getToolName(part);
  const [denyMode, setDenyMode] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const inputSummary = formatToolInput(part.input, toolName);

  const submitDeny = () => {
    onDeny(denyReason.trim() || undefined);
    setDenyMode(false);
    setDenyReason("");
  };

  return (
    <div className="border-warning-200 bg-warning-50 mb-1 rounded border p-2 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5">
        <ShieldAlertIcon className="text-warning h-3.5 w-3.5" />
        <span className="text-warning-700 font-medium">Approval Required</span>
        <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">
          {toolName}
        </Chip>
      </div>
      {inputSummary ? (
        <pre className="bg-default-100 mb-2 max-h-24 overflow-auto rounded p-1.5 font-mono text-[10px] break-all whitespace-pre-wrap">
          {inputSummary}
        </pre>
      ) : (
        part.input !== undefined && (
          <pre className="bg-default-100 mb-2 max-h-24 overflow-auto rounded p-1.5 text-[10px] break-all whitespace-pre-wrap">
            {JSON.stringify(part.input, null, 2)}
          </pre>
        )
      )}

      {denyMode ? (
        <div className="space-y-2">
          <input
            type="text"
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitDeny();
              }
            }}
            placeholder="Reason for denial (optional)"
            className="border-default-200 bg-default-50 focus:border-warning w-full rounded border px-2 py-1 text-sm outline-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" color="danger" variant="flat" onPress={submitDeny} className="h-6 min-w-0 text-xs">
              Confirm Deny
            </Button>
            <Button size="sm" variant="light" onPress={() => setDenyMode(false)} className="h-6 min-w-0 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" color="success" variant="flat" onPress={onApprove} className="h-6 min-w-0 text-xs">
            Approve
          </Button>
          <Button
            size="sm"
            color="danger"
            variant="flat"
            onPress={() => setDenyMode(true)}
            className="h-6 min-w-0 text-xs"
          >
            Deny
          </Button>
        </div>
      )}
    </div>
  );
};
