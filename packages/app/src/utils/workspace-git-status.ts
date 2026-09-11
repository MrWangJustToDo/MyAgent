import { splitStreamingLines } from "./streaming-output-lines.js";

// ============================================================================
// Git Status
// ============================================================================

export function parseGitStatus(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of splitStreamingLines(raw)) {
    if (line.length < 3) continue;
    const status = line.slice(0, 2).trim();
    const filepath = line.slice(3).trim();
    if (!filepath) continue;
    // Rename rows look like "R  old/path -> new/path" — index both sides so the
    // tree can render the old (deleted) and new (added) paths as separate rows.
    const rename = filepath.match(/^(.*) -> (.*)$/);
    const normalized = (p: string) => p.replace(/\\/g, "/");
    if (rename) {
      map.set(normalized(rename[1]!), status);
      map.set(normalized(rename[2]!), status);
    } else {
      map.set(normalized(filepath), status);
    }
  }
  return map;
}

let gitStatusCache: { rootPath: string; status: Map<string, string> } | null = null;

export function clearGitStatusCache(): void {
  gitStatusCache = null;
}

export async function fetchGitStatus(rootPath: string): Promise<Map<string, string>> {
  if (gitStatusCache && gitStatusCache.rootPath === rootPath) {
    return gitStatusCache.status;
  }
  try {
    const { getEnv } = await import("@my-agent/core");
    const result = await getEnv().runCommand("git status --porcelain", {
      cwd: rootPath,
    });
    const status = parseGitStatus(result.stdout);
    gitStatusCache = { rootPath, status };
    return status;
  } catch {
    return new Map();
  }
}
