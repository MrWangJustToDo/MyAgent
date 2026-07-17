import { zValidator } from "@hono/zod-validator";
import { ExecutionError, getEnv } from "@my-agent/core";
import { Hono } from "hono";
import { z } from "zod";

import type { CommandJobStatus, StartCommandHandle } from "@my-agent/core";

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

const startCommandSchema = z.object({
  command: z.string(),
  options: z
    .object({
      cwd: z.string().optional(),
      env: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

const commandOutputSchema = z.object({
  id: z.string(),
  sinceStdout: z.number().int().min(0).optional(),
  sinceStderr: z.number().int().min(0).optional(),
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

// ============================================================================
// Background Job Tracking
// ============================================================================

interface ServerJob {
  handle: StartCommandHandle;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: CommandJobStatus;
}

const serverJobs = new Map<string, ServerJob>();

export function destroyAllServerJobs(): void {
  for (const job of serverJobs.values()) {
    job.handle.kill().catch(() => {});
  }
  serverJobs.clear();
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
  })
  .post("/start", zValidator("json", startCommandSchema), async (c) => {
    try {
      const { command, options } = c.req.valid("json");

      const coreEnv = getEnv();
      if (!coreEnv.startCommand) {
        return c.json(
          {
            error: true,
            name: "Error",
            code: "unsupported",
            message: "Background commands not supported on this server.",
          },
          400
        );
      }

      const id = crypto.randomUUID();

      const job: ServerJob = {
        handle: null as unknown as StartCommandHandle,
        stdout: "",
        stderr: "",
        exitCode: null,
        status: "running",
      };

      const handle = await coreEnv.startCommand(command, {
        cwd: options?.cwd,
        env: options?.env,
        onStdout: (chunk: string) => {
          job.stdout += chunk;
        },
        onStderr: (chunk: string) => {
          job.stderr += chunk;
        },
        onExit: (exitCode: number | null) => {
          job.exitCode = exitCode;
          job.status = exitCode === 0 ? "exited" : "failed";
        },
      });

      job.handle = handle;
      serverJobs.set(id, job);

      return c.json({ id, pid: handle.pid });
    } catch (err) {
      const { body, status } = handleCommandError(err);
      return c.json(body, status);
    }
  })
  .post("/output", zValidator("json", commandOutputSchema), async (c) => {
    try {
      const { id, sinceStdout, sinceStderr } = c.req.valid("json");

      const job = serverJobs.get(id);
      if (!job) {
        return c.json({ error: true, name: "Error", code: "not_found", message: `Job ${id} not found` }, 404);
      }

      const stdout = sinceStdout !== undefined ? job.stdout.slice(sinceStdout) : job.stdout;
      const stderr = sinceStderr !== undefined ? job.stderr.slice(sinceStderr) : job.stderr;

      return c.json({
        id,
        status: job.status,
        stdout,
        stderr,
        exitCode: job.exitCode,
        running: job.status === "running",
      });
    } catch (err) {
      const { body, status } = handleCommandError(err);
      return c.json(body, status);
    }
  })
  .delete("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const job = serverJobs.get(id);
      if (!job) {
        return c.json({ error: true, name: "Error", code: "not_found", message: `Job ${id} not found` }, 404);
      }

      await job.handle.kill();
      job.status = "killed";
      serverJobs.delete(id);

      return c.json({ id, status: "killed", killed: true });
    } catch (err) {
      const { body, status } = handleCommandError(err);
      return c.json(body, status);
    }
  });
