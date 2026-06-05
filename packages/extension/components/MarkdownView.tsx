import Markdown from "markstream-react";

interface MarkdownViewProps {
  content: string;
  /** When true, stream is in progress — pass final={false} so partial constructs render correctly. */
  isStreaming?: boolean;
}

/**
 * Renders assistant markdown via markstream-react.
 *
 * Streaming config follows markstream-react docs:
 * - final={false} while tokens arrive; final={true} when complete
 * - viewportPriority / deferNodesUntilVisible defer heavy Mermaid/Monaco/D2 work
 * - mermaid/d2 debounce props reduce work during rapid token bursts
 */
export const MarkdownView = ({ content, isStreaming = false }: MarkdownViewProps) => {
  return (
    <div className="markstream-compact max-w-none overflow-hidden text-sm break-words">
      <Markdown
        content={content}
        final={!isStreaming}
        viewportPriority
        deferNodesUntilVisible
        codeBlockStream={isStreaming}
        mermaidProps={
          isStreaming
            ? {
                renderDebounceMs: 180,
                contentStableDelayMs: 400,
                previewPollDelayMs: 500,
                previewPollMaxDelayMs: 2000,
                previewPollMaxAttempts: 8,
              }
            : undefined
        }
        d2Props={isStreaming ? { progressiveIntervalMs: 500 } : undefined}
      />
    </div>
  );
};
