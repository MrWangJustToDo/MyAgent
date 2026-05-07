import Markdown from "markstream-react";

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView = ({ content }: MarkdownViewProps) => {
  return (
    <div className="markstream-compact max-w-none overflow-hidden text-sm break-words">
      <Markdown content={content} />
    </div>
  );
};
