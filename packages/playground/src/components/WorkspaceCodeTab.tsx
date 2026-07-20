import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { ExportWorkspaceDialog } from "./ExportWorkspaceDialog.js";
import { FileTree } from "./FileTree.js";

import type { OnMount } from "@monaco-editor/react";
import type { WebContainer } from "@webcontainer/api";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.Editor })));

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

  const loadFile = useCallback(
    async (path: string) => {
      try {
        const content = await wc.fs.readFile(path, "utf-8");
        console.log("content", content, path);
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

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void saveCurrentFile();
      });
    },
    [saveCurrentFile]
  );

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
    <div className="workspace-code-tab">
      <div className="workspace-code-tab__sidebar">
        <div className="workspace-code-tab__sidebar-header">Files</div>
        <FileTree
          wc={wc}
          rootPath={rootPath}
          onSelect={handleSelect}
          refreshKey={refreshKey}
          selectedPath={selectedPath}
        />
      </div>
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
            <span className="workspace-code-tab__editor-filename" style={{ color: "#666" }}>
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
          <button type="button" className="workspace-code-tab__header-btn" onClick={() => setExportOpen(true)}>
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
                  theme="vs-dark"
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
          <div className="workspace-code-tab__placeholder">Select a file from the tree to preview and edit</div>
        )}
      </div>
      {exportOpen && <ExportWorkspaceDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
};
