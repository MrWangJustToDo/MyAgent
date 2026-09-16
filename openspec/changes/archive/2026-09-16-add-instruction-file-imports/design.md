## Context

`CLAUDE.md` / `AGENTS.md` are discovered at agent creation and frozen into the system prompt as `<project_instructions>`. Claude Code's `@path` import syntax is the established way to compose them; this repo's cross-tool convention story (`@see https://agents.md/`) assumes a project can split its guidance across files.

Implementation reference consulted: Gemini CLI's `memoryImportProcessor` (a sibling implementation of the same feature) — `processedFiles` set, `maxDepth: 5`, path containment, code-region skipping, and `<!-- Import failed: ... -->` placeholders instead of silent drops. Its `maxDepth: 5` matches Claude Code's documented limit.

## Goals / Non-Goals

**Goals**

- A `CLAUDE.md` that references `AGENTS.md` actually loads `AGENTS.md`.
- A recursive or self-referential reference cannot hang the loader or balloon the prompt.
- No reference failure is silent: the model (and the operator) can see what did not load.
- One module owns discovery/expansion so the loader and the change detector cannot disagree.

**Non-Goals**

- Implicitly concatenating `CLAUDE.md` + `AGENTS.md`. Composition stays explicit (`@`).
- `~` expansion, URL imports, or glob imports.
- Subdirectory instruction files (`packages/*/AGENTS.md`) — a separate feature with its own ordering rules.
- Changing the `<project_instructions>` / `<instruction_context>` shell or the cache-stability contract.

## Decisions

### D1: Expand `@path` rather than fall back to `AGENTS.md`

**Decision.** First-found-wins stays; composition is explicit via `@path` expansion.

**Why.** Appending `AGENTS.md` whenever `CLAUDE.md` exists fixes this repo but double-injects on a project that maintains both as equals, and it invents a precedence rule the ecosystem does not have. `@` is the documented mechanism, and it is strictly more expressive (a project can import three files in a chosen order). The rejected alternative was "load first `k` files in priority order".

### D2: A leading `/` is project-root-relative, not filesystem-absolute

**Decision.** `@/openspec/AGENTS.md` resolves against the workspace root.

**Why.** This repo's own `AGENTS.md` uses that idiom (`@/openspec/AGENTS.md`, injected by `openspec update`), and project-root-relative is the reading Claude Code gives it. Treating it as filesystem-absolute would reject every such reference as an escape — which the first implementation did, visibly, on this repo.

**Consequence.** The only escape vector left is `../`, which is exactly what the containment guard is for.

### D3: A token is a reference only when it ends in a file extension

**Decision.** Require `/\.[A-Za-z0-9]{1,5}$/` on the token after peeling trailing punctuation.

**Why.** Instruction files are full of npm scopes (`@my-agent/core`, `@tanstack/ai`, `@types/*`) and mention-handles. Without the extension test, `@tanstack/ai` becomes a candidate and every such mention produces a "not found" notice, which would train readers to ignore the notices — defeating D5.

**Trade-off.** A file without an extension (`@Makefile`, `@LICENSE`) is not imported. Accepted: instruction files are markdown by convention, and a wrong guess is worse than a skipped one.

### D4: Cycle detection is per chain, not global

**Decision.** `visited` is copied per branch (as Gemini CLI does); `depth` likewise; the byte counter is shared.

**Why.** A global `visited` set would silently drop the *second* legitimate reference to a shared file, and "silently dropped" is the failure mode this change exists to remove. Per-chain copying means `a → b` and `a → c → b` both expand `b`, while `a → b → a` is cut where it closes the loop.

### D5: Every failure is reported, never dropped

**Decision.** Missing target, escape, directory, cycle, depth stop, budget stop, unreadable file — each records a notice. Notices are logged at bootstrap (`agent-factory`) and rendered into `<instruction_context>` (`formatInstructionContextSection`).

**Why.** A silently missing import is indistinguishable from a file that never had the content, which is the bug being fixed one level up. The notice is the difference between "the model lacks this guidance" and "the model lacks this guidance *and nobody knows*".

### D6: The digest covers expanded content **and** notices

**Decision.** The change-detection digest hashes the expanded text plus the notice list.

**Why.** Two failure modes if it hashed raw bytes: creating the imported file, and a cycle appearing or disappearing, would both leave the stale `<project_instructions>` in place — the exact staleness the turn-context path exists to fix. Notices are included because they are part of what the model is shown.

### D7: The budget counts bytes, and truncation is reported

**Decision.** Compare and slice by UTF-8 byte length, binary-searching the largest fitting character prefix; cut on a line boundary; report truncation.

**Why.** Dogfooding this repo produced 67583 bytes against a 65536-byte budget: the code compared `byteLength` but sliced `maxBytes` **characters**. ASCII-only content hides it; CJK (3 bytes) and emoji (4 bytes) do not. The budget's whole purpose is bounding prompt size, so overshooting by ~4x defeats it.

### D8: `importNotices` is required on `AgentDocLoadResult`, tolerant on the formatter

**Decision.** The load result always carries `importNotices: string[]`; `formatInstructionContextSection` treats absent notices as "none".

**Why.** At the load boundary there is no reason for a caller to omit it, and a required field makes the contract explicit. The formatter is a pure renderer called with hand-built literals in existing validators; forcing every literal to add `importNotices: []` would be churn for no behavioral gain.

### D9: Duplicated discovery logic is merged, not synchronized

**Decision.** `agent/prompt/instruction-files.ts` owns filenames, budget, discovery, override naming, and expansion. The loader and the turn-context path consume it; `DEFAULT_AGENT_DOC_*` and `INSTRUCTION_*` become re-exports of one definition.

**Why.** The two copies were already comment-synchronized and already wrong (D6 was only possible because the digest path had its own idea of what "the instruction content" is). Comments are not a synchronization mechanism.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| A document that writes `@file.md` meaning "see this file" now inlines it | That is the intended semantic; the inlined region is delimited with `<!-- import: … -->` so the boundary is visible in the prompt |
| A large import tree inflates the prompt | Depth 5 + 64 KiB budget + per-import budget check, all reported when they stop |
| Code-region scanning is a hand-rolled tokenizer | It follows CommonMark: a fence must open its own line and be 3+ chars, and a span closes only on a backtick run of the same length. Covered by dedicated cases; the failure mode is over- or under-skipping, both visible in the prompt rather than destructive |
| Behaviour change for existing projects | A bare `@dir/file.md` reference changes from literal text to inlined content. Projects relying on the literal form are rare, and the change is what makes the file's own instructions true |

## Migration Plan

No state migration. The loader is called per agent creation; the next launch picks up expansion automatically. `CLAUDE.md` in this repo is updated in the same change so the behavior is exercised by the repository itself.

## Open Questions

- Whether subdirectory instruction files (`packages/*/AGENTS.md`) should be discovered and concatenated — deliberately out of scope; it needs its own precedence rules (nearest-first? all? root-last?).
- Whether `@` imports should also be expanded for skill files or plan files — out of scope; this module is instruction-file-specific until a second consumer exists.
