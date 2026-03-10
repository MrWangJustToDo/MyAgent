import { Text } from "ink";
import { useMemo } from "react";
import { getMarkdown } from "stream-markdown-parser";

import { parseMarkdownWithHighlight } from "./parseWithHighlight";
import { renderNodesToString } from "./render";

export interface MarkdownProps {
  content?: string;
}

/**
 * Markdown component with source-side syntax highlighting.
 *
 * This component parses markdown and pre-highlights code blocks at parse time,
 * which improves rendering performance by avoiding per-frame highlighting.
 *
 * Uses a string-based renderer with chalk for full control over terminal output,
 * avoiding Ink's layout wrapping behaviors that can cause alignment issues.
 *
 * For streaming content (code blocks with `loading: true`), the component
 * falls back to streaming highlighting to provide real-time feedback.
 */
export const Markdown = ({ content }: MarkdownProps) => {
  const instance = useMemo(() => getMarkdown(), []);

  // Parse markdown with pre-tokenized syntax highlighting for code blocks
  const nodes = useMemo(() => parseMarkdownWithHighlight(content || "", instance), [content, instance]);

  // Render nodes to a styled string using chalk
  const rendered = useMemo(() => renderNodesToString(nodes), [nodes]);

  // Use Ink's Text component to output the pre-styled string
  return <Text>{rendered}</Text>;
};

export { parseMarkdownWithHighlight, createHighlightedParser } from "./parseWithHighlight";
export { renderNodesToString, renderNodeToString } from "./render";
export type { HighlightedCodeBlockNode, HighlightedParsedNode } from "./parseWithHighlight";
