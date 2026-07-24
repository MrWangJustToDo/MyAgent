## Why

After context compaction, the main agent only sees a summary plus the recent kept turns. Important decisions and discoveries that lived only in older messages are hard to recover, and the summarizer currently never sees the kept recent turns—so summaries can be stale or misaligned with what remains in context. We need (1) a greppable cold archive of pre-cut conversation and (2) fuller summarizer input without changing the post-compact message shape (`summary + kept`).

## What Changes

- **Full-context summarizer input**: When generating a compaction summary, pass the current LLM-visible conversation (budget-aware) to the summarization subagent, segmented into “to compress” vs “still in context”. Prompt rules: emphasize the compressed segment; use the kept segment only to align goals/next steps; do not duplicate kept turns in detail.
- **Unchanged compaction shape**: `findCutPoint` / `keepRecentFlows`, `cutIndex`, `summaryMessage + messages[compactIndex:]`, and apply/reactive compact assembly stay as they are.
- **Pre-compact transcript archive**: On successful auto/manual/reactive compaction, serialize the cut-away (and optionally labeled) transcript to a session-scoped file under a gitignored agents path (e.g. `.agents/transcripts/<sessionId>/`), and append an archive pointer to the summary so the agent can `grep` / `read_file` for details.
- **Archive format**: Plain-text transcript (reuse serialization style of `serializeConversation`), not raw tool JSON dumps.
- No **BREAKING** public package API expected; behavior and prompts change inside compaction.

## Capabilities

### New Capabilities

- `compaction-transcript-archive`: Persist searchable pre-compaction transcripts and surface their paths in the compaction summary for tool-based recall.

### Modified Capabilities

- `context-compaction`: Summarization SHALL consider full current LLM context (with segment labels and anti-duplication rules) while preserving existing cut/keep application semantics.

## Impact

- **Core**: `auto-compact.ts`, `compaction-prompt.ts`, `summarization-budget.ts` (input sizing), `apply-compaction-result.ts` / reactive compact apply path, new small archive helper module; possibly session id / rootPath via CoreEnv.
- **Repo hygiene**: `.gitignore` for `.agents/transcripts/` (or document under existing ignored agents dirs).
- **Docs**: `AGENTS.md` / core architecture compaction section — archive path + summarizer input behavior.
- **App/CLI**: No UI requirement for v1 (archive is for the agent tools); optional future browse.
- **Validation**: Core scripts covering prompt segmentation and archive write/pointer.
