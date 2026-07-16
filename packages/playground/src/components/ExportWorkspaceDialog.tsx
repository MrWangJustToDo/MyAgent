import { useCallback, useEffect, useMemo, useState } from "react";

import { buildWorkspaceZip, downloadUint8Array } from "../webcontainer/build-workspace-zip.js";
import { getBootedWebContainer } from "../webcontainer/create-env.js";
import {
  deselectByDirName,
  listWorkspaceEntries,
  pathDepth,
  selectedFilePaths,
  togglePathSelection,
  type WorkspaceEntry,
} from "../webcontainer/workspace-export-selection.js";

type Props = {
  onClose: () => void;
};

export const ExportWorkspaceDialog = ({ onClose }: Props) => {
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError("");
      try {
        const wc = getBootedWebContainer();
        if (!wc) {
          throw new Error("WebContainer is not ready yet.");
        }
        const listed = await listWorkspaceEntries(wc.fs, "/", { maxEntries: 5000 });
        if (cancelled) return;
        setTruncated(listed.length >= 5000);
        setEntries(listed);
        // Default: everything except node_modules / .git
        const initial = new Set(listed.map((e) => e.path));
        setSelected(deselectByDirName(deselectByDirName(initial, listed, "node_modules"), listed, ".git"));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const fileCount = useMemo(() => selectedFilePaths(selected, entries).length, [selected, entries]);

  const toggle = useCallback(
    (path: string, checked: boolean) => {
      setSelected((prev) => togglePathSelection(prev, entries, path, checked));
    },
    [entries]
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(entries.map((e) => e.path)));
  }, [entries]);

  const selectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  const skipHeavy = useCallback(() => {
    setSelected((prev) => deselectByDirName(deselectByDirName(prev, entries, "node_modules"), entries, ".git"));
  }, [entries]);

  const runExport = useCallback(async () => {
    const wc = getBootedWebContainer();
    if (!wc) {
      setError("WebContainer is not ready yet.");
      return;
    }
    const files = selectedFilePaths(selected, entries);
    if (files.length === 0) {
      setError("Select at least one file to export.");
      return;
    }

    setExporting(true);
    setError("");
    try {
      const zip = await buildWorkspaceZip(wc.fs, files);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadUint8Array(`playground-workspace-${stamp}.zip`, zip);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [entries, onClose, selected]);

  return (
    <div className="export-dialog" role="dialog" aria-modal="true" aria-label="Export workspace">
      <div className="export-dialog__header">
        <strong>Export workspace</strong>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="export-dialog__hint">
        Choose files to download as a ZIP. Directories include their children when checked. Default selection skips{" "}
        <code>node_modules</code> and <code>.git</code>.
      </p>

      <div className="export-dialog__toolbar">
        <button type="button" onClick={selectAll} disabled={loading || entries.length === 0}>
          Select all
        </button>
        <button type="button" onClick={selectNone} disabled={loading}>
          None
        </button>
        <button type="button" onClick={skipHeavy} disabled={loading || entries.length === 0}>
          Skip node_modules / .git
        </button>
        <span className="export-dialog__count">
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="export-dialog__list">
        {loading && <div className="export-dialog__status">Scanning workspace…</div>}
        {!loading && entries.length === 0 && !error && <div className="export-dialog__status">Workspace is empty.</div>}
        {!loading &&
          entries.map((entry) => {
            const depth = pathDepth(entry.path);
            const label = entry.path === "/" ? "/" : entry.path.slice(entry.path.lastIndexOf("/") + 1);
            return (
              <label
                key={entry.path}
                className={
                  entry.type === "directory" ? "export-dialog__row export-dialog__row--dir" : "export-dialog__row"
                }
                style={{ paddingLeft: 10 + depth * 14 }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(entry.path)}
                  onChange={(e) => toggle(entry.path, e.target.checked)}
                />
                <span title={entry.path}>{entry.type === "directory" ? `${label}/` : label}</span>
              </label>
            );
          })}
      </div>

      {truncated && (
        <p className="export-dialog__warn">
          Listing stopped at 5000 entries — trim the workspace or export in batches.
        </p>
      )}
      {error && <p className="export-dialog__error">{error}</p>}

      <div className="export-dialog__footer">
        <button
          type="button"
          className="export-dialog__primary"
          disabled={exporting || loading}
          onClick={() => void runExport()}
        >
          {exporting ? "Exporting…" : "Download ZIP"}
        </button>
      </div>
    </div>
  );
};
