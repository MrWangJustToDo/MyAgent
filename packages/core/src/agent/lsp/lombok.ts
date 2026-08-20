/**
 * Lombok jar discovery for jdtls (mirrors pi-lsp-extension).
 */

export interface LombokSearchDeps {
  rootDir: string;
  path: { join: (...parts: string[]) => string; resolve: (...parts: string[]) => string };
  exists: (p: string) => Promise<boolean>;
  readdir: (p: string) => Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>;
  getEnvVar: (key: string) => string | undefined;
  /** Explicit path from setLombokJar / .lsp.json (already resolved absolute). */
  explicitJar: string | null;
}

/** Resolve a Lombok jar for `-javaagent` (explicit path, LOMBOK_JAR, or workspace env/ auto-detect). */
export async function findLombokJar(deps: LombokSearchDeps): Promise<string | null> {
  if (deps.explicitJar && (await deps.exists(deps.explicitJar))) {
    return deps.explicitJar;
  }

  const envJar = deps.getEnvVar("LOMBOK_JAR");
  if (envJar) {
    const resolved = deps.path.resolve(deps.rootDir, envJar);
    if (await deps.exists(resolved)) return resolved;
  }

  const envDir = deps.path.join(deps.rootDir, "env");
  if (!(await deps.exists(envDir))) return null;

  try {
    const lombokDirs = (await deps.readdir(envDir)).filter((e) => e.isDirectory && e.name.startsWith("Lombok-"));
    for (const dir of lombokDirs) {
      const libDir = deps.path.join(envDir, dir.name, "runtime", "lib");
      if (!(await deps.exists(libDir))) continue;
      const jars = (await deps.readdir(libDir)).filter(
        (e) => e.isFile && e.name.startsWith("lombok-") && e.name.endsWith(".jar")
      );
      if (jars.length > 0) return deps.path.join(libDir, jars[0]!.name);
    }
  } catch {
    // ignore
  }

  const gradleLombok = deps.path.join(envDir, "gradle-cache-2", "org", "projectlombok", "lombok");
  if (await deps.exists(gradleLombok)) {
    try {
      for (const ver of await deps.readdir(gradleLombok)) {
        if (!ver.isDirectory) continue;
        const jarPath = deps.path.join(gradleLombok, ver.name, `lombok-${ver.name}.jar`);
        if (await deps.exists(jarPath)) return jarPath;
      }
    } catch {
      // ignore
    }
  }

  return null;
}
