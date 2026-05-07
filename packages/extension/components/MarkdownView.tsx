import Markdown from "markstream-react";

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView = ({ content }: MarkdownViewProps) => {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden text-sm break-words [&_pre]:overflow-x-auto [&_pre]:text-xs">
      <Markdown content={content} />
    </div>
  );
};
