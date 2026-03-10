import chalk from "chalk";
import Table from "cli-table3";
import terminalLink from "terminal-link";

import type { HighlightedCodeBlockNode, HighlightedParsedNode } from "./parseWithHighlight";
import type { ThemedToken } from "shiki";
import type {
  ParsedNode,
  TextNode,
  HeadingNode,
  ParagraphNode,
  InlineCodeNode,
  ListNode,
  ListItemNode,
  BlockquoteNode,
  LinkNode,
  ImageNode,
  TableNode,
  ThematicBreakNode,
  StrongNode,
  EmphasisNode,
  StrikethroughNode,
  HardBreakNode,
  CheckboxNode,
  CheckboxInputNode,
  HighlightNode,
  InsertNode,
  SubscriptNode,
  SuperscriptNode,
  EmojiNode,
  AdmonitionNode,
  MathInlineNode,
  MathBlockNode,
  HtmlBlockNode,
  HtmlInlineNode,
  DefinitionListNode,
  DefinitionItemNode,
  FootnoteNode,
  FootnoteReferenceNode,
  VmrContainerNode,
  ReferenceNode,
  CustomComponentNode,
  UnknownNode,
} from "stream-markdown-parser";

/* GitHub Dark Theme Colors */
const colors = {
  text: chalk.hex("#c9d1d9"),
  muted: chalk.hex("#8b949e"),
  heading: chalk.hex("#e6edf3").bold,
  link: chalk.hex("#58a6ff").underline,
  code: chalk.hex("#e6edf3").bgHex("#343942"),
  codeBlock: chalk.hex("#e6edf3"),
  border: chalk.hex("#30363d"),
  success: chalk.hex("#3fb950"),
  warning: chalk.hex("#d29922"),
  error: chalk.hex("#f85149"),
  info: chalk.hex("#58a6ff"),
  purple: chalk.hex("#a371f7"),
};

/** Rendering context to track nesting depth */
interface RenderContext {
  /** Current list nesting depth (0 = top level) */
  listDepth: number;
}

const defaultContext: RenderContext = { listDepth: 0 };

/* Render a single node to string */
export const renderNodeToString = (
  node: ParsedNode | HighlightedParsedNode,
  context: RenderContext = defaultContext
): string => {
  switch (node.type) {
    case "text":
      return renderText(node as TextNode);
    case "heading":
      return renderHeading(node as HeadingNode, context);
    case "paragraph":
      return renderParagraph(node as ParagraphNode, context);
    case "code_block":
      return renderCodeBlock(node as HighlightedCodeBlockNode);
    case "inline_code":
      return renderInlineCode(node as InlineCodeNode);
    case "list":
      return renderList(node as ListNode, context);
    case "blockquote":
      return renderBlockquote(node as BlockquoteNode, context);
    case "link":
      return renderLink(node as LinkNode);
    case "image":
      return renderImage(node as ImageNode);
    case "table":
      return renderTable(node as TableNode, context);
    case "thematic_break":
      return renderThematicBreak(node as ThematicBreakNode);
    case "strong":
      return renderStrong(node as StrongNode, context);
    case "emphasis":
      return renderEmphasis(node as EmphasisNode, context);
    case "strikethrough":
      return renderStrikethrough(node as StrikethroughNode, context);
    case "hardbreak":
      return renderHardBreak(node as HardBreakNode);
    case "checkbox":
    case "checkbox_input":
      return renderCheckbox(node as CheckboxNode | CheckboxInputNode);
    case "highlight":
      return renderHighlight(node as HighlightNode, context);
    case "insert":
      return renderInsert(node as InsertNode, context);
    case "subscript":
      return renderSubscript(node as SubscriptNode, context);
    case "superscript":
      return renderSuperscript(node as SuperscriptNode, context);
    case "emoji":
      return renderEmoji(node as EmojiNode);
    case "admonition":
      return renderAdmonition(node as AdmonitionNode, context);
    case "math_inline":
      return renderMathInline(node as MathInlineNode);
    case "math_block":
      return renderMathBlock(node as MathBlockNode);
    case "html_block":
      return renderHtmlBlock(node as HtmlBlockNode);
    case "html_inline":
      return renderHtmlInline(node as HtmlInlineNode, context);
    case "definition_list":
      return renderDefinitionList(node as DefinitionListNode, context);
    case "footnote":
      return renderFootnote(node as FootnoteNode, context);
    case "footnote_reference":
      return renderFootnoteReference(node as FootnoteReferenceNode);
    case "vmr_container":
      return renderVmrContainer(node as VmrContainerNode, context);
    case "reference":
      return renderReference(node as ReferenceNode);
    case "custom_component":
      return renderCustomComponent(node as CustomComponentNode, context);
    default:
      return renderUnknown(node as UnknownNode, context);
  }
};

/* Render children nodes */
const renderChildren = (
  children: (ParsedNode | HighlightedParsedNode)[],
  context: RenderContext = defaultContext
): string => {
  return children.map((node) => renderNodeToString(node, context)).join("");
};

/* Individual node renderers */

const renderText = (node: TextNode): string => {
  return node.content;
};

const renderHeading = (node: HeadingNode, context: RenderContext): string => {
  const text = renderChildren(node.children, context);
  const prefix = colors.muted("#".repeat(node.level) + " ");
  return prefix + colors.heading(text);
};

const renderParagraph = (node: ParagraphNode, context: RenderContext): string => {
  return renderChildren(node.children, context);
};

/**
 * Render shiki tokens to a styled string.
 * Each token has a color from the theme that we apply using chalk.
 */
const renderTokens = (tokens: ThemedToken[][]): string => {
  return tokens
    .map((line) => {
      return line
        .map((token) => {
          if (token.color) {
            return chalk.hex(token.color)(token.content);
          }
          return colors.codeBlock(token.content);
        })
        .join("");
    })
    .join("\n");
};

const renderCodeBlock = (node: HighlightedCodeBlockNode): string => {
  // Use pre-highlighted tokens if available
  let code: string;
  if (node.tokens && node.tokens.length > 0) {
    code = renderTokens(node.tokens);
  } else {
    // Fallback to plain code (no syntax highlighting)
    code = colors.codeBlock(node.code);
  }

  // Clean up trailing newlines and whitespace
  code = code.replace(/\n+$/, "");

  // Remove closing fence if it appears at the end (can happen during streaming)
  // Match ``` with optional language hint that might have been incorrectly included
  code = code.replace(/\n?`{3,}\s*$/, "");

  // Add loading indicator for streaming content
  const loadingIndicator = node.loading ? colors.muted("...") : "";

  // Add left border to each line
  const leftBar = colors.border("│ ");
  const lines = code
    .split("\n")
    .map((line) => leftBar + line)
    .join("\n");

  // Language label on first line if present
  const langLabel = node.language ? colors.muted(node.language) + "\n" : "";

  return "\n" + langLabel + lines + loadingIndicator;
};

const renderInlineCode = (node: InlineCodeNode): string => {
  return colors.code(node.code);
};

const renderList = (node: ListNode, context: RenderContext): string => {
  const indent = "  ".repeat(context.listDepth);
  const nestedContext = { ...context, listDepth: context.listDepth + 1 };

  const items = node.items
    .map((item, index) => {
      const marker = node.ordered ? colors.muted(`${(node.start ?? 1) + index}. `) : colors.muted("• ");
      const content = renderListItem(item, nestedContext);
      return indent + marker + content;
    })
    .join("\n");

  // Nested lists need a leading newline to separate from parent item text
  return context.listDepth === 0 ? items : "\n\n" + items + "\n\n";
};

const renderListItem = (node: ListItemNode, context: RenderContext): string => {
  // Render children, handling nested lists specially
  const parts: string[] = [];

  for (const child of node.children) {
    const rendered = renderNodeToString(child, context);
    parts.push(rendered);
  }

  return parts.join("").replace(/\n$/, "");
};

const renderBlockquote = (node: BlockquoteNode, context: RenderContext): string => {
  const content = renderChildren(node.children, context);
  const lines = content.split("\n").filter((l) => l);
  const quoted = lines.map((line) => colors.border("│ ") + colors.muted(line)).join("\n");
  return quoted;
};

const renderLink = (node: LinkNode): string => {
  const text = node.text || node.href;
  // Use terminal-link to make clickable links in supported terminals
  // Falls back to just showing the text in unsupported terminals
  return colors.link(terminalLink(text, node.href));
};

const renderImage = (node: ImageNode): string => {
  return colors.muted(`[Image: ${node.alt || "image"}]`);
};

const renderTable = (node: TableNode, context: RenderContext): string => {
  const table = new Table({
    head: node.header.cells.map((cell) => colors.heading(renderChildren(cell.children, context)).toString()),
    style: {
      head: [],
      border: ["gray"],
    },
  });

  node.rows.forEach((row) => {
    table.push(row.cells.map((cell) => renderChildren(cell.children, context)));
  });

  return table.toString();
};

const renderThematicBreak = (_node: ThematicBreakNode): string => {
  return colors.muted("───");
};

const renderStrong = (node: StrongNode, context: RenderContext): string => {
  return chalk.bold(renderChildren(node.children, context));
};

const renderEmphasis = (node: EmphasisNode, context: RenderContext): string => {
  return chalk.italic(renderChildren(node.children, context));
};

const renderStrikethrough = (node: StrikethroughNode, context: RenderContext): string => {
  return chalk.strikethrough(renderChildren(node.children, context));
};

const renderHardBreak = (_node: HardBreakNode): string => {
  return "\n";
};

const renderCheckbox = (node: CheckboxNode | CheckboxInputNode): string => {
  return node.checked ? colors.success("[x] ") : colors.muted("[ ] ");
};

const renderHighlight = (node: HighlightNode, context: RenderContext): string => {
  return chalk.bgYellow.black(renderChildren(node.children, context));
};

const renderInsert = (node: InsertNode, context: RenderContext): string => {
  return chalk.underline(renderChildren(node.children, context));
};

const renderSubscript = (node: SubscriptNode, context: RenderContext): string => {
  return colors.muted(renderChildren(node.children, context));
};

const renderSuperscript = (node: SuperscriptNode, context: RenderContext): string => {
  return colors.muted(renderChildren(node.children, context));
};

const renderEmoji = (node: EmojiNode): string => {
  return node.markup;
};

const renderAdmonition = (node: AdmonitionNode, context: RenderContext): string => {
  const kindColors: Record<string, typeof colors.info> = {
    note: colors.info,
    tip: colors.success,
    important: colors.purple,
    warning: colors.warning,
    caution: colors.warning,
    danger: colors.error,
    error: colors.error,
  };

  const icons: Record<string, string> = {
    note: "ℹ",
    tip: "💡",
    important: "❗",
    warning: "⚠",
    caution: "⚠",
    danger: "🔴",
    error: "🔴",
  };

  const color = kindColors[node.kind.toLowerCase()] || colors.muted;
  const icon = icons[node.kind.toLowerCase()] || "📝";
  const title = node.title || node.kind.charAt(0).toUpperCase() + node.kind.slice(1);
  const content = renderChildren(node.children, context);

  return color(`${icon} ${title}`) + "\n" + color("│ ") + content;
};

const renderMathInline = (node: MathInlineNode): string => {
  return colors.purple(`$${node.content}$`);
};

const renderMathBlock = (node: MathBlockNode): string => {
  return colors.purple(node.content);
};

const renderHtmlBlock = (node: HtmlBlockNode): string => {
  return colors.muted(node.content);
};

const renderHtmlInline = (node: HtmlInlineNode, context: RenderContext): string => {
  if (node.children && node.children.length > 0) {
    return renderChildren(node.children, context);
  }
  return colors.muted(node.content);
};

const renderDefinitionList = (node: DefinitionListNode, context: RenderContext): string => {
  const items = node.items
    .map((item: DefinitionItemNode) => {
      const term = colors.heading(renderChildren(item.term, context));
      const definition = "  " + renderChildren(item.definition, context);
      return term + "\n" + definition;
    })
    .join("\n");
  return items;
};

const renderFootnote = (node: FootnoteNode, context: RenderContext): string => {
  const label = colors.muted(`[^${node.id}]: `);
  const content = renderChildren(node.children, context);
  return label + content;
};

const renderFootnoteReference = (node: FootnoteReferenceNode): string => {
  return colors.info(`[^${node.id}]`);
};

const renderVmrContainer = (node: VmrContainerNode, context: RenderContext): string => {
  // VMR container - render name and children
  const name = node.name ? colors.muted(`:::${node.name}`) + "\n" : "";
  const content = renderChildren(node.children, context);
  const closing = node.loading ? "" : "\n" + colors.muted(":::");
  return name + content + closing;
};

const renderReference = (node: ReferenceNode): string => {
  // Reference node - just show the id
  return colors.muted(`[${node.id}]`);
};

const renderCustomComponent = (node: CustomComponentNode, context: RenderContext): string => {
  // Render custom component - show content or children
  if (node.children && node.children.length > 0) {
    return renderChildren(node.children, context);
  }
  return node.content || "";
};

const renderUnknown = (node: UnknownNode, context: RenderContext): string => {
  // Fallback for unknown nodes - try to render children if present
  if ("children" in node && Array.isArray(node.children)) {
    return renderChildren(node.children as ParsedNode[], context);
  }
  if ("content" in node && typeof node.content === "string") {
    return node.content;
  }
  return "";
};

/* Render all nodes to string */
export const renderNodesToString = (
  nodes: (ParsedNode | HighlightedParsedNode)[],
  context: RenderContext = defaultContext
): string => {
  return nodes
    .map((node) => renderNodeToString(node, context))
    .map((i) => {
      while (i.startsWith("\n")) {
        i = i.slice(1);
      }
      while (i.endsWith("\n")) {
        i = i.slice(0, i.length - 1);
      }
      return i;
    })
    .join("\n\n");
};
