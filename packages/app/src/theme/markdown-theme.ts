/**
 * Markdown theme for StreamMarkdown — rebuilt when the app color palette changes.
 */

import chalk from "chalk";

import { BG, COLORS } from "./colors.js";

import type { ThemeOptions } from "ink-stream-markdown";

function buildMarkdownTheme(): ThemeOptions {
  return {
    text: chalk.hex(COLORS.text),
    heading: chalk.hex(COLORS.text).bold,
    firstHeading: chalk.hex(COLORS.primary).bold.underline,
    link: chalk.hex(COLORS.primary),
    href: chalk.hex(COLORS.primary).underline,
    strong: chalk.bold,
    em: chalk.italic,
    del: chalk.dim.strikethrough,
    code: chalk.hex(COLORS.accent),
    codeBlock: chalk.hex(COLORS.accent),
    blockquote: chalk.hex(COLORS.muted).italic,
    listItem: chalk.hex(COLORS.text),
    hr: chalk.hex(BG.border),
    html: chalk.hex(COLORS.muted),
    table: chalk.hex(COLORS.text),
    muted: chalk.hex(COLORS.muted),
    border: chalk.hex(BG.border),
    success: chalk.hex(COLORS.success),
    warning: chalk.hex(COLORS.warning),
    error: chalk.hex(COLORS.danger),
    info: chalk.hex(COLORS.primary),
    purple: chalk.hex(COLORS.accent),
    mark: chalk.bgHex(COLORS.warning + "26").hex(COLORS.text),
  };
}

/** Mutable markdown theme — refreshed by {@link rebuildMarkdownTheme}. */
export const markdownTheme: ThemeOptions = buildMarkdownTheme();

export function rebuildMarkdownTheme(): void {
  Object.assign(markdownTheme, buildMarkdownTheme());
}
