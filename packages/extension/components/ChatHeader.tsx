import { BotIcon, HistoryIcon } from "lucide-react";

import { useServerConfig } from "@/hooks/useServerConfig";

export const ChatHeader = ({ status, onShowSessions }: { status: string; onShowSessions?: () => void }) => {
  const model = useServerConfig((s) => s.model);

  return (
    <div className="border-divider flex shrink-0 items-center gap-2 border-b px-3 py-2">
      <BotIcon className="text-primary h-4 w-4 shrink-0" />
      <span className="shrink-0 text-sm font-semibold">My Agent</span>
      {model && <span className="text-default-500 min-w-0 flex-1 truncate text-right text-[11px]">{model}</span>}
      {onShowSessions && (
        <button onClick={onShowSessions} className="text-default-500 hover:text-primary shrink-0 transition-colors">
          <HistoryIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${status === "streaming" ? "bg-warning animate-pulse" : "bg-success"}`}
      />
    </div>
  );
};
