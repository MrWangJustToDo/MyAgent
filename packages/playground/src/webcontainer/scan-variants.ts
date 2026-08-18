import type { FileSystemAPI } from "@webcontainer/api";

export interface VariantDescriptor {
  /** Workspace-relative path (e.g. `/variant-1.html`). */
  id: string;
  /** Display name (basename). */
  name: string;
  /** Raw HTML content. */
  html: string;
}

const SKIP_DIRS = new Set(["node_modules", ".git"]);

/** Case-insensitive natural sort so `variant-2` comes before `variant-10`. */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function isTopLevel(path: string): boolean {
  // "/" → no segments; "/variant-1.html" → ["variant-1.html"] (length 1)
  return path.split("/").filter(Boolean).length === 1;
}

/**
 * List top-level `*.html` files under `rootPath` and read each into a variant
 * descriptor. Sorted stably (variant-1 < variant-2 < ... < variant-10).
 */
export async function scanVariants(fs: FileSystemAPI, rootPath = "/"): Promise<VariantDescriptor[]> {
  let entries;
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const htmlFiles = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => name.toLowerCase().endsWith(".html"))
    .sort(naturalCompare);

  const variants: VariantDescriptor[] = [];
  for (const name of htmlFiles) {
    if (SKIP_DIRS.has(name)) continue;
    const path = rootPath === "/" ? `/${name}` : `${rootPath}/${name}`;
    if (!isTopLevel(path)) continue;
    try {
      const html = await fs.readFile(path, "utf-8");
      variants.push({ id: path, name, html });
    } catch {
      // Unreadable / removed mid-scan — skip.
    }
  }

  return variants;
}
