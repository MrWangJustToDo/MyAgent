import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { collectDropEntries, hasUsableDropItems, uploadEntryTree } from "../utils/upload-files.js";

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
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
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

  const finishUpload = useCallback((count: number) => {
    setUploadStatus(`Uploaded ${count} file${count > 1 ? "s" : ""}`);
    window.dispatchEvent(new CustomEvent("agent:action"));
    setUploading(false);
    setTimeout(() => setUploadStatus(""), 2000);
  }, []);

  const failUpload = useCallback((err?: unknown) => {
    const detail = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
    console.error("[workspace] upload failed", err);
    setUploadStatus(`Upload failed: ${detail}`);
    setUploading(false);
    setTimeout(() => setUploadStatus(""), 6000);
  }, []);

  // Upload a FileList (from the file/folder pickers). Returns the count written.
  const uploadFileList = useCallback(
    async (files: FileList): Promise<number> => {
      let count = 0;
      for (const file of files) {
        const relativePath = file.webkitRelativePath || file.name;
        const parts = relativePath.split("/");
        const destPath = "/" + parts.slice(parts[0] === "" ? 1 : 0).join("/");
        const content = new Uint8Array(await file.arrayBuffer());
        // WebContainer's native writeFile does NOT create parent dirs — mkdir first.
        const parentIdx = destPath.lastIndexOf("/");
        if (parentIdx > 0) {
          await wc.fs.mkdir(destPath.slice(0, parentIdx), { recursive: true }).catch(() => {});
        }
        await wc.fs.writeFile(destPath, content);
        count++;
      }
      return count;
    },
    [wc.fs]
  );

  const handleUpload = useCallback(
    async (files: FileList) => {
      setUploading(true);
      setUploadStatus(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
      try {
        const count = await uploadFileList(files);
        finishUpload(count);
      } catch (err) {
        failUpload(err);
      }
    },
    [uploadFileList, finishUpload, failUpload]
  );

  // Upload dropped files/folders by walking the entry tree.
  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!e.dataTransfer.items || e.dataTransfer.items.length === 0) return;
      setUploading(true);
      setUploadStatus("Uploading…");
      try {
        const entries = collectDropEntries(e.dataTransfer.items);
        let count = 0;
        if (entries.length > 0) {
          for (const entry of entries) {
            count += await uploadEntryTree(wc, entry, "", () => {});
          }
        } else {
          // Fallback: browsers without webkitGetAsEntry — upload plain FileList.
          count = await uploadFileList(e.dataTransfer.files);
        }
        finishUpload(count);
      } catch (err) {
        failUpload(err);
      }
    },
    [wc.fs, finishUpload, failUpload, uploadFileList]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

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

  const handleFolderChange = useCallback(
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
          "editor.background": "#111116",
          "editor.foreground": "#f5f5f7",
          "editorLineNumber.foreground": "#3f3f48",
          "editorLineNumber.activeForeground": "#a3a3ae",
          "editor.selectionBackground": "#8f8dff33",
          "editor.inactiveSelectionBackground": "#8f8dff1a",
          "editor.lineHighlightBackground": "#ffffff06",
          "editorCursor.foreground": "#cbc9ff",
          "editorIndentGuide.background1": "#ffffff0a",
          "editorIndentGuide.activeBackground1": "#ffffff18",
          "editorWidget.background": "#18181e",
          "editorWidget.border": "#ffffff12",
          "dropdown.background": "#18181e",
          "input.background": "#0d0d11",
          focusBorder: "#8f8dff66",
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
    <div
      ref={containerRef}
      className={`workspace-code-tab${dragActive ? "workspace-code-tab--drag" : ""}`}
      onDragOver={handleDragOver}
      onDragEnter={(e) => {
        e.preventDefault();
        if (hasUsableDropItems(e.dataTransfer.items)) setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragActive(false);
      }}
      onDrop={(e) => {
        setDragActive(false);
        void handleDrop(e);
      }}
    >
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
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is a Chromium/WebKit extension
            webkitdirectory=""
            style={{ display: "none" }}
            onChange={handleFolderChange}
          />
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
            title="Upload files"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 10V2.5m0 0L5 5.5M8 2.5l3 3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            {uploading ? "Uploading…" : "Upload files"}
          </button>
          <button
            type="button"
            className="workspace-code-tab__header-btn"
            disabled={uploading}
            onClick={() => folderInputRef.current?.click()}
            title="Upload a folder (directory picker)"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6a1.5 1.5 0 0 1 1.06.44L8.5 4.8h4A1.5 1.5 0 0 1 14 6.3v5.2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
            Upload folder
          </button>
          <button
            type="button"
            className="workspace-code-tab__header-btn workspace-code-tab__header-btn--primary"
            onClick={() => setExportOpen(true)}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 2.5v7m0 0 3-3M8 9.5l-3-3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
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
