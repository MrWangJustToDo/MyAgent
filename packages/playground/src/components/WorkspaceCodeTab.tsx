import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { ExportWorkspaceDialog } from "./ExportWorkspaceDialog.js";
import { FileTree } from "./FileTree.js";

import type { OnMount } from "@monaco-editor/react";
import type { WebContainer } from "@webcontainer/api";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.Editor })));

const SIDEBAR_STORAGE_KEY = "my-agent-playground-sidebar";
const MIN_SIDEBAR_WIDTH = 140;
const MAX_SIDEBAR_WIDTH = 500;

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= MIN_SIDEBAR_WIDTH) return n;
    }
  } catch {
    // ignore
  }
  return 240;
}

function persistSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
  } catch {
    // ignore
  }
}

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  md: "markdown",
  py: "python",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  sh: "shell",
  bash: "shell",
  go: "go",
  rs: "rust",
  java: "java",
  rb: "ruby",
  vue: "html",
  svelte: "html",
  sql: "sql",
  dart: "dart",
  toml: "plaintext",
  env: "plaintext",
  csv: "plaintext",
  txt: "plaintext",
};

function extToLang(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx === -1) return "plaintext";
  return EXT_LANG[filename.slice(dotIdx + 1).toLowerCase()] ?? "plaintext";
}

interface WorkspaceCodeTabProps {
  wc: WebContainer;
  rootPath: string;
  refreshKey: number;
}

export const WorkspaceCodeTab = ({ wc, rootPath, refreshKey }: WorkspaceCodeTabProps) => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLang, setFileLang] = useState("plaintext");
  const [modified, setModified] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const currentContentRef = useRef<string>("");
  const currentPathRef = useRef<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const sidebarResizeRef = useRef(false);
  const sidebarLiveRef = useRef(sidebarWidth);
  sidebarLiveRef.current = sidebarWidth;
  const containerRef = useRef<HTMLDivElement>(null);

  const loadFile = useCallback(
    async (path: string) => {
      try {
        const content = await wc.fs.readFile(path, "utf-8");
        setFileContent(content);
        currentContentRef.current = content;
        setFileLang(extToLang(path.split("/").pop() ?? ""));
        setModified(false);
        currentPathRef.current = path;
      } catch {
        setFileContent("// Error reading file");
        setFileLang("plaintext");
      }
    },
    [wc.fs]
  );

  const saveCurrentFile = useCallback(async () => {
    const path = currentPathRef.current;
    if (!path) return;
    try {
      await wc.fs.writeFile(path, currentContentRef.current);
      setModified(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    } catch {
      // ignore
    }
  }, [wc.fs]);

  const handleSelect = useCallback(
    (path: string) => {
      if (modified && currentPathRef.current) {
        const prev = currentPathRef.current;
        const content = currentContentRef.current;
        wc.fs.writeFile(prev, content).catch(() => {});
      }
      // setSelectedPath(path);
      void loadFile(path).then(() => setSelectedPath(path));
    },
    [modified, wc.fs, loadFile]
  );

  const handleUpload = useCallback(
    async (files: FileList) => {
      setUploading(true);
      setUploadStatus(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
      let count = 0;
      try {
        for (const file of files) {
          const relativePath = file.webkitRelativePath || file.name;
          const parts = relativePath.split("/");
          const destPath = "/" + parts.slice(parts[0] === "" ? 1 : 0).join("/");

          const parentDir = destPath.slice(0, destPath.lastIndexOf("/"));
          if (parentDir) {
            await wc.fs.mkdir(parentDir, { recursive: true }).catch(() => {});
          }

          const content = await file.arrayBuffer();
          await wc.fs.writeFile(destPath, new Uint8Array(content));
          count++;
        }
        setUploadStatus(`Uploaded ${count} file${count > 1 ? "s" : ""}`);
        window.dispatchEvent(new CustomEvent("agent:action"));
      } catch {
        setUploadStatus("Upload failed");
      } finally {
        setUploading(false);
        setTimeout(() => setUploadStatus(""), 2000);
      }
    },
    [wc.fs]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        void handleUpload(files);
      }
      e.target.value = "";
    },
    [handleUpload]
  );

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      monaco.editor.defineTheme("playground-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": "#141418",
          "editor.foreground": "#e4e4e7",
          "editorLineNumber.foreground": "#3f3f46",
          "editorLineNumber.activeForeground": "#a1a1aa",
          "editor.selectionBackground": "#6b8cff33",
          "editor.inactiveSelectionBackground": "#6b8cff1a",
          "editor.lineHighlightBackground": "#ffffff06",
          "editorCursor.foreground": "#8fa4ff",
          "editorIndentGuide.background1": "#ffffff0a",
          "editorIndentGuide.activeBackground1": "#ffffff18",
          "editorWidget.background": "#1a1a20",
          "editorWidget.border": "#ffffff12",
          "dropdown.background": "#1a1a20",
          "input.background": "#121216",
          focusBorder: "#6b8cff66",
        },
      });
      monaco.editor.setTheme("playground-dark");

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void saveCurrentFile();
      });
    },
    [saveCurrentFile]
  );

  const handleSidebarResizeStart = useCallback(() => {
    sidebarResizeRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarResizeRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(newWidth, MAX_SIDEBAR_WIDTH)));
    };
    const handleMouseUp = () => {
      if (!sidebarResizeRef.current) return;
      sidebarResizeRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persistSidebarWidth(sidebarLiveRef.current);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      currentContentRef.current = value;
      setModified(true);
    }
  }, []);

  useEffect(() => {
    if (currentPathRef.current) {
      void loadFile(currentPathRef.current);
    }
  }, [refreshKey]);

  useEffect(() => {
    return () => {
      if (currentPathRef.current && modified) {
        wc.fs.writeFile(currentPathRef.current, currentContentRef.current).catch(() => {});
      }
    };
  }, [wc.fs, modified]);

  const filename = selectedPath?.split("/").pop() ?? "";

  return (
    <div ref={containerRef} className="workspace-code-tab">
      <div className="workspace-code-tab__sidebar" style={{ width: sidebarWidth }}>
        <div className="workspace-code-tab__sidebar-header">Files</div>
        <FileTree
          wc={wc}
          rootPath={rootPath}
          onSelect={handleSelect}
          refreshKey={refreshKey}
          selectedPath={selectedPath}
        />
      </div>
      <div className="workspace-code-tab__splitter" onMouseDown={handleSidebarResizeStart} />
      <div className="workspace-code-tab__editor">
        <div className="workspace-code-tab__editor-header">
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileChange} />
          {selectedPath ? (
            <>
              <span className="workspace-code-tab__editor-filename">{filename}</span>
              {modified && <span className="workspace-code-tab__modified">● modified</span>}
              {savedFlash && <span className="workspace-code-tab__saved">Saved</span>}
            </>
          ) : (
            <span className="workspace-code-tab__editor-filename workspace-code-tab__editor-filename--muted">
              No file selected
            </span>
          )}
          <div className="workspace-code-tab__header-spacer" />
          {uploadStatus && <span className="workspace-code-tab__upload-status">{uploadStatus}</span>}
          <button
            type="button"
            className="workspace-code-tab__header-btn"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            title="Upload files or folders"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <button
            type="button"
            className="workspace-code-tab__header-btn workspace-code-tab__header-btn--primary"
            onClick={() => setExportOpen(true)}
          >
            Export
          </button>
        </div>
        {selectedPath ? (
          <>
            <div className="workspace-code-tab__editor-body">
              <Suspense fallback={<div className="workspace-code-tab__loading">Loading editor…</div>}>
                <MonacoEditor
                  key={selectedPath}
                  value={fileContent}
                  language={fileLang}
                  theme="playground-dark"
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
                    lineNumbers: "on",
                    renderWhitespace: "selection",
                    tabSize: 2,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 8 },
                    wordWrap: "on",
                  }}
                />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="workspace-code-tab__placeholder">
            <div className="workspace-panel__placeholder-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M5 3.5h5.5L14 7v7.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path d="M10.5 3.5V7H14" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="workspace-panel__placeholder-title">No file open</div>
            <span>Select a file from the tree to preview and edit</span>
          </div>
        )}
      </div>
      {exportOpen && <ExportWorkspaceDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
};
