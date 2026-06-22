import { zValidator } from "@hono/zod-validator";
import { ExecutionError, getEnv } from "@my-agent/core";
import { Hono } from "hono";
import { z } from "zod";

const runCommandSchema = z.object({
  command: z.string(),
  options: z
    .object({
      cwd: z.string().optional(),
      env: z.record(z.string(), z.string()).optional(),
      timeout: z.number().int().min(0).optional(),
    })
    .optional(),
});

const execSchema = z.object({
  command: z.string(),
  options: z
    .object({
      cwd: z.string().optional(),
      timeout: z.number().int().min(0).optional(),
      env: z.record(z.string(), z.string().optional()).optional(),
    })
    .optional(),
});

function handleCommandError(err: unknown): { body: Record<string, unknown>; status: 400 | 500 } {
  if (err instanceof ExecutionError) {
    return {
      body: { error: true, name: "ExecutionError", code: err.code, message: err.message },
      status: 400,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { body: { error: true, name: "Error", code: "unknown", message }, status: 500 };
}

export const commandRoutes = new Hono()
  .post("/run", zValidator("json", runCommandSchema), async (c) => {
    try {
      const { command, options } = c.req.valid("json");
      const result = await getEnv().runCommand(command, options);
      return c.json(result);
    } catch (err) {
      const { body, status } = handleCommandError(err);
      return c.json(body, status);
    }
  })
  .post("/exec", zValidator("json", execSchema), async (c) => {
    try {
      const { command, options } = c.req.valid("json");
      const result = await getEnv().exec(command, options);
      return c.json(result);
    } catch (err) {
      const { body, status } = handleCommandError(err);
      return c.json(body, status);
    }
  });
