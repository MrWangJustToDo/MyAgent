## Context

Compaction today (`autoCompact` → `summarizeConversation` → `applyCompactionResult`) cuts at `keepRecentFlows` user turns: only `messages[summaryOffset:llmCutIndex]` is sent to the summarizer. The main agent then sees `[summaryMessage, ...messages[compactIndex:]]`. UI/session history may still hold older turns, but the model cannot search them after the cut. Summaries also lack awareness of the kept tail, so Goal/Next can drift.

Constraints: ESM core package; CoreEnv for fs/path; existing `serializeConversation` + summarization budget; no change to post-compact assembly contract relied on by middleware and `/compact`.

## Goals / Non-Goals

**Goals:**

- Summarizer receives full current LLM-visible context (budget-aware), labeled as compress vs keep, without changing `cutIndex` / summary+kept application.
- On successful compaction, write a greppable plain-text archive of the compressed segment and point to it from the summary.
- Archive lives outside normal project source (gitignored agents/session path) and works with existing `grep` / `read_file`.

**Non-Goals:**

- Changing `keepRecentFlows` defaults or cut-point algorithm.
- Putting full pre-cut messages back into the main agent context.
- Dedicated `search_transcript` tool in v1 (reuse grep/read).
- UI browser for archives.
- Cross-process file locks beyond CoreEnv fs writes.

## Decisions

1. **Summarizer input = segmented full LLM view**  
   - Build prompt body from `toCompress = messages.slice(summaryOffset, llmCutIndex)` and `stillInContext = messages.slice(llmCutIndex)`, wrapped in `<to_compress>` / `<still_in_context>` (plus existing `<previous-summary>` when present).  
   - Rationale: cut logic stays; quality improves.  
   - Alternative rejected: only enlarge `toSummarize` without labels (duplicates kept turns in summary).

2. **Budget**  
   - Continue using `resolveSummarizationInputBudget` / segment merge; prefer dropping or truncating tool-result bulk inside serialization before dropping still_in_context text.  
   - Rationale: still_in_context is smaller and high-signal for alignment.

3. **Archive location**  
   - `.agents/transcripts/<sessionId>/compact-<n>.md` under workspace `rootPath` (CoreEnv), gitignored.  
   - Rationale: existing tools resolve workspace paths; sessionId isolates concurrent sessions.  
   - Alternative rejected: dump into `.sessions/*.json` only (not greppable with current tools without a new API).

4. **Archive content**  
   - Serialize with `serializeConversation` (or shared helper) for the compressed slice; header metadata: session id, compact sequence, timestamp, cut index.  
   - Rationale: searchable, bounded tool noise.

5. **Summary pointer**  
   - Append a short section after summary (+ file-ops), e.g. `## Compact archive` + relative path + one-line instruction to grep/read when details are missing.  
   - Failure to write archive MUST NOT fail compaction; log/emit optional event and omit pointer.

6. **Apply sites**  
   - Auto-compact middleware path, `/compact` command, and reactive compact share one `writeCompactArchive` helper after successful summary generation.

## Risks / Trade-offs

- **[Risk] Summarizer prompt too long** → Mitigation: existing budget split; truncate tool results in serialization; never block compaction on archive I/O.  
- **[Risk] Summary still duplicates kept turns** → Mitigation: explicit anti-duplication rules in compaction prompt.  
- **[Risk] Archive growth / commit noise** → Mitigation: gitignore; optional future retention limit (document as follow-up).  
- **[Risk] Agent ignores archive pointer** → Mitigation: clear summary section; later can strengthen system/turn hint (out of scope).  
- **[Trade-off] Workspace-visible files** vs pure session blob: choose workspace path for tool reuse.

## Migration Plan

- Ship behind normal build; no session schema migration required (archives are additive files).  
- Add `.agents/transcripts/` to root `.gitignore` if not already covered.  
- Rollback: revert prompt/archive calls; old sessions without archives still work.

## Open Questions

- None blocking: session id source is ManagedAgent session store id (fallback `agentId` if missing). Retention/pruning deferred.
