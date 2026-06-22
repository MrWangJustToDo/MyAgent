import { zValidator } from "@hono/zod-validator";
import { FileError, getEnv } from "@my-agent/core";
import { Hono } from "hono";
import { z } from "zod";

const pathSchema = z.object({ path: z.string() });

function handleFsError(err: unknown): { body: Record<string, unknown>; status: 400 | 500 } {
  if (err instanceof FileError) {
    return {
      body: { error: true, name: "FileError", code: err.code, message: err.message, path: err.path },
      status: 400,
    };
  }
  if (err instanceof Error && "code" in err) {
    const nodeErr = err as NodeJS.ErrnoException;
    const codeMap: Record<string, string> = {
      ENOENT: "not_found",
      EACCES: "permission_denied",
      EPERM: "permission_denied",
      EISDIR: "is_directory",
      ENOTDIR: "not_directory",
    };
    const mapped = nodeErr.code ? codeMap[nodeErr.code] : undefined;
    if (mapped) {
      return {
        body: { error: true, name: "FileError", code: mapped, message: err.message, path: nodeErr.path ?? "" },
        status: 400,
      };
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return { body: { error: true, name: "Error", code: "unknown", message }, status: 500 };
}

export const fsRoutes = new Hono()
  .post("/readFile", zValidator("json", z.object({ path: z.string(), encoding: z.string().optional() })), async (c) => {
    try {
      const { path, encoding } = c.req.valid("json");
      const content = await getEnv().fs.readFile(path, encoding);
      return c.json({ content });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/readFileBuffer", zValidator("json", pathSchema), async (c) => {
    try {
      const { path } = c.req.valid("json");
      const env = getEnv();
      if (!env.fs.readFileBuffer) {
        return c.json(
          { error: true, name: "Error", code: "not_supported", message: "readFileBuffer not available" },
          400
        );
      }
      const buffer = await env.fs.readFileBuffer(path);
      const data = env.base64Encode(buffer);
      return c.json({ data });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/stat", zValidator("json", pathSchema), async (c) => {
    try {
      const { path } = c.req.valid("json");
      const stat = await getEnv().fs.stat(path);
      return c.json({
        isDirectory: stat.isDirectory,
        isFile: stat.isFile,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/readdir", zValidator("json", pathSchema), async (c) => {
    try {
      const { path } = c.req.valid("json");
      const entries = await getEnv().fs.readdir(path);
      return c.json({
        entries: entries.map((e) => ({
          name: e.name,
          type: e.type,
          size: e.size,
          modified: e.modified?.toISOString(),
        })),
      });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/writeFile", zValidator("json", z.object({ path: z.string(), content: z.string() })), async (c) => {
    try {
      const { path, content } = c.req.valid("json");
      await getEnv().fs.writeFile(path, content);
      return c.json({ ok: true });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/mkdir", zValidator("json", pathSchema), async (c) => {
    try {
      const { path } = c.req.valid("json");
      await getEnv().fs.mkdir(path);
      return c.json({ ok: true });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/exists", zValidator("json", pathSchema), async (c) => {
    try {
      const { path } = c.req.valid("json");
      const exists = await getEnv().fs.exists(path);
      return c.json({ exists });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/remove", zValidator("json", pathSchema), async (c) => {
    try {
      const { path } = c.req.valid("json");
      await getEnv().fs.remove(path);
      return c.json({ ok: true });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/appendFile", zValidator("json", z.object({ path: z.string(), content: z.string() })), async (c) => {
    try {
      const { path, content } = c.req.valid("json");
      const env = getEnv();
      if (!env.fs.appendFile) {
        return c.json({ error: true, name: "Error", code: "not_supported", message: "appendFile not available" }, 400);
      }
      await env.fs.appendFile(path, content);
      return c.json({ ok: true });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  })
  .post("/mimeType", zValidator("json", pathSchema), async (c) => {
    try {
      const { path } = c.req.valid("json");
      const env = getEnv();
      if (!env.getMimeType) {
        return c.json({ mimeType: false as const });
      }
      const mimeType = await env.getMimeType(path);
      return c.json({ mimeType });
    } catch (err) {
      const { body, status } = handleFsError(err);
      return c.json(body, status);
    }
  });
