/**
 * In-memory registry for background shell jobs started via CoreEnv.startCommand.
 */

import { generateId } from "../../../utils/generate-id.js";

export type CommandJobStatus = "running" | "exited" | "killed" | "failed";

export interface CommandJobRecord {
  id: string;
  command: string;
  status: CommandJobStatus;
  stdout: string;
  stderr: string;
  /** Byte cursor for incremental stdout polls (UTF-16 code units / JS string length). */
  stdoutReadOffset: number;
  stderrReadOffset: number;
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
  /** Adapter-provided kill (best-effort). */
  kill?: () => Promise<void>;
}

export interface CommandJobPollResult {
  jobId: string;
  status: CommandJobStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  running: boolean;
}

/** A finished background job surfaced to the model as a completion notification. */
export interface CompletedCommandJob {
  id: string;
  command: string;
  status: CommandJobStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: number;
  endedAt: number | null;
}

class CommandJobRegistry {
  private readonly jobs = new Map<string, CommandJobRecord>();

  /** Job ids already surfaced to the model as completion notifications (dedupe). */
  private readonly notifiedJobIds = new Set<string>();

  create(command: string): CommandJobRecord {
    const id = generateId("job");
    const record: CommandJobRecord = {
      id,
      command,
      status: "running",
      stdout: "",
      stderr: "",
      stdoutReadOffset: 0,
      stderrReadOffset: 0,
      exitCode: null,
      startedAt: Date.now(),
      endedAt: null,
    };
    this.jobs.set(id, record);
    return record;
  }

  get(jobId: string): CommandJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  setKill(jobId: string, kill: () => Promise<void>): void {
    const job = this.jobs.get(jobId);
    if (job) job.kill = kill;
  }

  appendStdout(jobId: string, chunk: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "running") return;
    job.stdout += chunk;
  }

  appendStderr(jobId: string, chunk: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "running") return;
    job.stderr += chunk;
  }

  markExited(jobId: string, exitCode: number | null): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "running") return;
    job.status = exitCode === 0 || exitCode === null ? "exited" : "exited";
    job.exitCode = exitCode ?? 1;
    job.endedAt = Date.now();
  }

  markFailed(jobId: string, message?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (message) job.stderr += (job.stderr ? "\n" : "") + message;
    job.status = "failed";
    job.exitCode = job.exitCode ?? 1;
    job.endedAt = Date.now();
  }

  markKilled(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "killed";
    job.endedAt = Date.now();
  }

  /**
   * Return unread stdout/stderr since last poll and advance cursors.
   */
  poll(jobId: string): CommandJobPollResult | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const stdout = job.stdout.slice(job.stdoutReadOffset);
    const stderr = job.stderr.slice(job.stderrReadOffset);
    job.stdoutReadOffset = job.stdout.length;
    job.stderrReadOffset = job.stderr.length;

    return {
      jobId: job.id,
      status: job.status,
      stdout,
      stderr,
      exitCode: job.exitCode,
      running: job.status === "running",
    };
  }

  async kill(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.status === "running" && job.kill) {
      await job.kill();
    }
    if (job.status === "running") {
      this.markKilled(jobId);
    }
    return true;
  }

  /**
   * Drain the completion queue: every job that has finished but not yet been
   * notified to the model. Marks them notified (each job notified exactly once).
   *
   * Independent of {@link poll} — this does NOT advance the incremental read
   * cursors, so the model can still read full output via get_command_output.
   */
  collectCompleted(): CompletedCommandJob[] {
    const completed: CompletedCommandJob[] = [];
    for (const [id, job] of this.jobs) {
      if (job.status === "running") continue;
      if (this.notifiedJobIds.has(id)) continue;
      this.notifiedJobIds.add(id);
      completed.push({
        id: job.id,
        command: job.command,
        status: job.status,
        exitCode: job.exitCode,
        stdout: job.stdout,
        stderr: job.stderr,
        startedAt: job.startedAt,
        endedAt: job.endedAt,
      });
    }
    return completed;
  }

  async destroyAll(): Promise<void> {
    const ids = [...this.jobs.keys()];
    await Promise.all(ids.map((id) => this.kill(id)));
    this.jobs.clear();
    this.notifiedJobIds.clear();
  }

  clear(): void {
    this.jobs.clear();
    this.notifiedJobIds.clear();
  }
}

/** Session-scoped registry (reset when CoreEnv is cleared). */
export const commandJobRegistry = new CommandJobRegistry();

/** Kill all background jobs and clear the registry (CoreEnv destroy / clear). */
export async function destroyAllCommandJobs(): Promise<void> {
  await commandJobRegistry.destroyAll();
}
