import { getMarkdown, parseMarkdownToStructure } from "stream-markdown-parser";

import { highlightCode } from "../utils/highlighter";

import type { ThemedToken } from "shiki";
import type { ParsedNode, CodeBlockNode } from "stream-markdown-parser";

// Common emoji patterns used as visual list markers
// Matches lines starting with emoji followed by space (with optional leading whitespace)
const EMOJI_BULLET_REGEX =
  /^(\s*)([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{2B55}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3030}\u{303D}\u{3297}\u{3299}][\uFE0F]?)\s+(.+)$/gmu;

/**
 * Preprocess markdown to convert emoji-prefixed lines into proper unordered lists.
 *
 * This handles patterns like:
 * ```
 * ✅ No urgent updates needed
 * ⚠️ Monitor internal packages
 * 📝 Consider documenting
 * ```
 *
 * And converts them to:
 * ```
 * - ✅ No urgent updates needed
 * - ⚠️ Monitor internal packages
 * - 📝 Consider documenting
 * ```
 */
const preprocessEmojiLists = (markdown: string): string => {
  // Split by double newlines to identify blocks
  const blocks = markdown.split(/\n\n+/);

  const processedBlocks = blocks.map((block) => {
    // Check if this block contains consecutive emoji-prefixed lines
    const lines = block.split("\n");
    let emojiLineCount = 0;
    let hasNonEmojiLine = false;

    for (const line of lines) {
      // Reset the regex lastIndex for each test
      EMOJI_BULLET_REGEX.lastIndex = 0;
      if (EMOJI_BULLET_REGEX.test(line)) {
        emojiLineCount++;
      } else if (line.trim() !== "") {
        hasNonEmojiLine = true;
      }
    }

    // Only convert if we have multiple consecutive emoji lines and no mixed content
    // (at least 2 emoji lines make it look like a list)
    if (emojiLineCount >= 2 && !hasNonEmojiLine) {
      // Convert each emoji-prefixed line to a list item
      EMOJI_BULLET_REGEX.lastIndex = 0;
      return block.replace(EMOJI_BULLET_REGEX, "$1- $2 $3");
    }

    return block;
  });

  return processedBlocks.join("\n\n");
};

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
 * - Emoji-prefixed lines are preprocessed into proper unordered lists
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
  // Preprocess emoji-prefixed lines into proper lists
  const preprocessed = preprocessEmojiLists(markdown);
  const nodes = parseMarkdownToStructure(preprocessed, instance);
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
