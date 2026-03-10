import { getMarkdown, parseMarkdownToStructure } from "stream-markdown-parser";

import { highlightCode } from "../utils/highlighter";

import type { ThemedToken } from "shiki";
import type { ParsedNode, CodeBlockNode } from "stream-markdown-parser";

/**
 * Extended CodeBlockNode with pre-tokenized syntax highlighting.
 */
export interface HighlightedCodeBlockNode extends CodeBlockNode {
  /** Pre-tokenized syntax highlighting tokens (line-by-line) */
  tokens?: ThemedToken[][];
  /** Flattened tokens for easy rendering */
  flatTokens?: ThemedToken[];
}

/**
 * Extended ParsedNode type that includes highlighted code blocks.
 */
export type HighlightedParsedNode = Exclude<ParsedNode, CodeBlockNode> | HighlightedCodeBlockNode;

/**
 * Check if a code block should be highlighted at parse time.
 * Returns false for streaming/loading content to preserve streaming behavior.
 */
const shouldPreHighlight = (node: CodeBlockNode): boolean => {
  // Don't highlight if language is still being typed (has cursor marker)
  if (node.language?.endsWith("▌")) {
    return false;
  }

  // Don't highlight if no valid language
  if (!node.language || !node.language.trim()) {
    return false;
  }

  return true;
};

/**
 * Transform a single code block node by adding syntax highlighting tokens.
 */
const highlightCodeBlock = (node: CodeBlockNode): HighlightedCodeBlockNode => {
  if (!shouldPreHighlight(node)) {
    return node;
  }

  const tokens = highlightCode(node.code, node.language);

  // Flatten tokens for easier rendering
  const flatTokens = tokens.flat();

  return {
    ...node,
    tokens,
    flatTokens,
  };
};

/**
 * Recursively transform nodes, highlighting code blocks.
 */
const transformNodes = (nodes: ParsedNode[]): HighlightedParsedNode[] => {
  return nodes.map((node) => {
    if (node.type === "code_block") {
      return highlightCodeBlock(node as CodeBlockNode);
    }

    // Recursively transform children for container nodes
    if ("children" in node && Array.isArray(node.children)) {
      return {
        ...node,
        children: transformNodes(node.children as ParsedNode[]),
      } as HighlightedParsedNode;
    }

    // Handle list items
    if (node.type === "list" && "items" in node) {
      return {
        ...node,
        items: transformNodes(node.items as ParsedNode[]),
      } as HighlightedParsedNode;
    }

    return node as HighlightedParsedNode;
  });
};

/**
 * Parse markdown and pre-highlight code blocks at parse time.
 *
 * This is a hybrid approach:
 * - Complete code blocks are highlighted synchronously at parse time
 * - Streaming/loading code blocks retain their original structure for streaming highlight
 *
 * @param markdown - The markdown content to parse
 * @param md - Optional MarkdownIt instance (created if not provided)
 * @returns Array of parsed nodes with highlighted code blocks
 */
export const parseMarkdownWithHighlight = (
  markdown: string,
  md?: ReturnType<typeof getMarkdown>
): HighlightedParsedNode[] => {
  const instance = md ?? getMarkdown();
  const nodes = parseMarkdownToStructure(markdown, instance);
  return transformNodes(nodes);
};

/**
 * Create a memoized parser instance for use in React components.
 */
export const createHighlightedParser = () => {
  const instance = getMarkdown();

  return {
    instance,
    parse: (markdown: string) => parseMarkdownWithHighlight(markdown, instance),
  };
};
