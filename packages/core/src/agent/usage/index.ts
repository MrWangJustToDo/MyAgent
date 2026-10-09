/**
 * Usage accounting: the append-only JSONL store and the history facade over it.
 *
 * Exposes the barrel every other `agent/*` domain here uses (`memory`, `subagent`, `skills`,
 * `lsp`, `plan`) — `src/index.ts` and `dev/dev-managers.ts` each reach into this directory, and
 * the type surface is consumed from two different modules of it.
 *
 * The two modules stay separate behind the barrel: `usage-store.ts` is the on-disk format +
 * aggregation (`.agents/usage/usage-<year>.jsonl`), while `usage-history-service.ts` is the
 * facade that serializes writes and is the only thing callers should reach for when recording.
 */

export {
  getUsageLogPath,
  toDayKey,
  USAGE_DIR,
  USAGE_FILE_PREFIX,
  USAGE_FILE_SUFFIX,
  USAGE_RECORD_VERSION,
  UsageStore,
} from "./usage-store.js";
export type {
  DailyUsageBucket,
  ModelUsageTotal,
  UsageHistoryResult,
  UsageRecord,
  UsageRecordInput,
} from "./usage-store.js";

export { sharedUsageHistory, UsageHistoryService } from "./usage-history-service.js";
