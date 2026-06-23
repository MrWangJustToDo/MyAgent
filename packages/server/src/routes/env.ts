import { getEnv } from "@my-agent/core";
import { Hono } from "hono";

const SENSITIVE_EXACT = new Set([
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "NPM_TOKEN",
  "SSH_AUTH_SOCK",
  "GPG_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
]);

const SENSITIVE_PATTERNS = [/password/i, /secret/i, /credential/i, /private_key/i];

function filterSensitiveVars(vars: Record<string, string | undefined>): Record<string, string | undefined> {
  const filtered: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (SENSITIVE_EXACT.has(key)) continue;
    if (SENSITIVE_PATTERNS.some((p) => p.test(key))) continue;
    filtered[key] = value;
  }
  return filtered;
}

export const envRoutes = new Hono()
  .get("/info", async (c) => {
    const env = getEnv();
    const [platform, arch, homedir] = await Promise.all([env.getPlatform(), env.getArch(), env.homedir()]);
    return c.json({ rootPath: env.rootPath, platform, arch, homedir, sep: env.path.getSep() });
  })
  .get("/vars", async (c) => {
    const vars = await getEnv().getEnv();
    return c.json(filterSensitiveVars(vars));
  })
  .post("/destroy", async (c) => {
    const env = getEnv();
    if (env.destroy) {
      await env.destroy();
    }
    return c.json({ ok: true });
  });
