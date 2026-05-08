import { ClockIcon, HistoryIcon } from "lucide-react";

import type { SessionMeta } from "@/hooks/useSessions";

interface SessionPickerProps {
  sessions: SessionMeta[];
  onSelect: (session: SessionMeta) => void;
  onNewSession: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;

  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

export const SessionPicker = ({ sessions, onSelect, onNewSession }: SessionPickerProps) => {
  return (
    <div className="flex h-full flex-col">
      <div className="border-divider flex items-center gap-2 border-b px-3 py-2">
        <HistoryIcon className="text-primary h-4 w-4" />
        <span className="text-sm font-semibold">Sessions</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={onNewSession}
          className="hover:bg-default-100 border-divider w-full border-b px-3 py-2.5 text-left transition-colors"
        >
          <span className="text-primary text-sm font-medium">+ New Session</span>
        </button>

        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelect(session)}
            className="hover:bg-default-100 border-divider w-full border-b px-3 py-2.5 text-left transition-colors"
          >
            <div className="truncate text-sm font-medium">{session.name}</div>
            <div className="text-default-500 mt-0.5 flex items-center gap-2 text-[11px]">
              <span>{session.model}</span>
              <span className="flex items-center gap-0.5">
                <ClockIcon className="h-3 w-3" />
                {formatDate(session.updatedAt)}
              </span>
            </div>
          </button>
        ))}

        {sessions.length === 0 && (
          <div className="text-default-400 px-3 py-6 text-center text-sm">No previous sessions</div>
        )}
      </div>
    </div>
  );
};
