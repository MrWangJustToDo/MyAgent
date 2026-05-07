import { ChatPanel } from "@/components/ChatPanel";
import { ConnectionGuard } from "@/components/ConnectionGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const App = () => {
  return (
    <div className="bg-background text-foreground flex h-screen flex-col">
      <ErrorBoundary>
        <ConnectionGuard>
          <ChatPanel />
        </ConnectionGuard>
      </ErrorBoundary>
    </div>
  );
};
