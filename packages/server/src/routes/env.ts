import { getEnv } from "@my-agent/core";
import { Hono } from "hono";

const SENSITIVE_PATTERNS = [/key/i, /secret/i, /token/i, /password/i, /credential/i, /auth/i, /private/i];

function filterSensitiveVars(vars: Record<string, string | undefined>): Record<string, string | undefined> {
  const filtered: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (SENSITIVE_PATTERNS.some((p) => p.test(key))) continue;
    filtered[key] = value;
  }
  return filtered;
}

export const envRoutes = new Hono()
  .get("/info", async (c) => {
    const env = getEnv();
    const [platform, arch, homedir] = await Promise.all([env.getPlatform(), env.getArch(), env.homedir()]);
    return c.json({ rootPath: env.rootPath, platform, arch, homedir });
  })
  .get("/vars", async (c) => {
    const vars = await getEnv().getEnv();
    return c.json(filterSensitiveVars(vars));
  });
