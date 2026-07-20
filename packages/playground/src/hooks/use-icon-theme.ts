interface IconThemeData {
  iconDefinitions: Record<string, { iconPath: string }>;
  file: string;
  folder: string;
  folderNames: Record<string, string>;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
}

let darkTheme: IconThemeData | null = null;
let lightTheme: IconThemeData | null = null;

const BASE = "./assets";

async function loadTheme(path: string): Promise<IconThemeData> {
  const res = await fetch(`${BASE}/${path}`);
  return res.json();
}

function resolveKey(name: string, type: "file" | "folder", theme: IconThemeData): string {
  if (type === "folder") {
    return theme.folderNames[name] ?? theme.folder;
  }

  if (theme.fileNames[name]) return theme.fileNames[name];

  const dotIdx = name.indexOf(".");
  if (dotIdx !== -1) {
    const fullExt = name.slice(dotIdx + 1);

    if (theme.fileExtensions[fullExt]) return theme.fileExtensions[fullExt];

    const lastDot = name.lastIndexOf(".");
    if (lastDot !== dotIdx) {
      const compoundExt = name.slice(name.lastIndexOf(".", lastDot - 1) + 1);
      if (theme.fileExtensions[compoundExt]) return theme.fileExtensions[compoundExt];
    }

    const simpleExt = name.slice(lastDot + 1);
    if (theme.fileExtensions[simpleExt]) return theme.fileExtensions[simpleExt];
  }

  return theme.file;
}

function resolveUrl(iconPath: string): string {
  return `${BASE}/${iconPath.replace("./", "")}`;
}

let loaded = false;
let loadPromise: Promise<void> | null = null;

export async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [dark, light] = await Promise.all([
        loadTheme("dark-jetbrains-icon-theme.json"),
        loadTheme("light-jetbrains-icon-theme.json"),
      ]);
      darkTheme = dark;
      lightTheme = light;
      loaded = true;
    } catch {
      // fallback — minimal hardcoded set so the UI still works
      darkTheme = {
        iconDefinitions: {},
        file: "file_text",
        folder: "folder",
        folderNames: {},
        fileNames: {},
        fileExtensions: {},
      };
      lightTheme = darkTheme;
      loaded = true;
    }
  })();
  return loadPromise;
}

export interface FileIconResult {
  light: string;
  dark: string;
}

export async function resolveFileIcon(name: string, type: "file" | "folder"): Promise<FileIconResult> {
  await ensureLoaded();

  const lightKey = resolveKey(name, type, lightTheme!);
  const darkKey = resolveKey(name, type, darkTheme!);
  const lightDef = lightTheme!.iconDefinitions[lightKey];
  const darkDef = darkTheme!.iconDefinitions[darkKey];

  return {
    light: lightDef ? resolveUrl(lightDef.iconPath) : "",
    dark: darkDef ? resolveUrl(darkDef.iconPath) : "",
  };
}

export function getIconUrlSync(name: string, isDirectory: boolean): string {
  const theme = darkTheme;
  if (!theme) return "";
  const type = isDirectory ? "folder" : "file";
  const key = resolveKey(name, type, theme);
  const def = theme.iconDefinitions[key];
  return def ? resolveUrl(def.iconPath) : "";
}
