import { BotIcon } from "lucide-react";

export const StreamingIndicator = () => {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="bg-default-100 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
        <BotIcon className="text-default-600 h-3.5 w-3.5" />
      </div>
      <div className="flex gap-1">
        <span className="bg-default-400 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
        <span className="bg-default-400 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
        <span className="bg-default-400 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
      </div>
    </div>
  );
};
