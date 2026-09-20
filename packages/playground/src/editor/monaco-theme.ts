import type { Monaco } from "@monaco-editor/react";

/**
 * Monaco theme derived from the shell's design tokens.
 *
 * Defined once here so the code tab and the variants panel cannot drift into two
 * slightly different editors. Values mirror `styles/tokens.css`.
 */
export const PLAYGROUND_MONACO_THEME = "playground-dark";

export function definePlaygroundTheme(monaco: Monaco): void {
  monaco.editor.defineTheme(PLAYGROUND_MONACO_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0d0d10",
      "editor.foreground": "#ededf0",
      "editorLineNumber.foreground": "#3f3f48",
      "editorLineNumber.activeForeground": "#a1a1aa",
      "editor.selectionBackground": "#6366f133",
      "editor.inactiveSelectionBackground": "#6366f11a",
      "editor.lineHighlightBackground": "#ffffff05",
      "editorCursor.foreground": "#c7c8fc",
      "editorIndentGuide.background1": "#ffffff0a",
      "editorIndentGuide.activeBackground1": "#ffffff18",
      "editorWidget.background": "#121216",
      "editorWidget.border": "#ffffff12",
      "editorGutter.background": "#0d0d10",
      "dropdown.background": "#121216",
      "input.background": "#08080a",
      focusBorder: "#6366f166",
    },
  });
  monaco.editor.setTheme(PLAYGROUND_MONACO_THEME);
}

/** Shared editor options so both editors stay visually identical. */
export const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 12.5,
  fontFamily: "'Geist Mono Variable', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
  lineHeight: 19,
  lineNumbers: "on" as const,
  renderWhitespace: "selection" as const,
  tabSize: 2,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 10, bottom: 10 },
  wordWrap: "on" as const,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
};
