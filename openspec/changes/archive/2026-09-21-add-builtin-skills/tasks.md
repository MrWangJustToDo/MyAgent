## 1. Correct the extension docs the skill depends on

The skill must not teach claims that contradict the implementation. These two are wrong today.

- [x] 1.1 `examples/extensions/demo-turn-context.mjs` — replace `ctx.registerTurnContextProvider()` (not on
      `ExtensionContext`, `agent/extension/types.ts:512-564`) with `ctx.registerContextProvider({ content })`
      (`types.ts:327-332`), and drop the `event.appendTurnContext` / `event.appendSystemPrompt` writes
      (`types.ts:500-513` are the sole `BeforeAgentStartPayload` fields). Update the file header comment and
      the "Try:" block to match.
- [x] 1.2 `examples/extensions/README.md` — fix the `/extensions` claims (line 28) and the footer-surface
      description: there is no `extensions` slash command in `packages/app/src/commands/` (enable/disable is
      the `Ctrl+Y` panel, `ExtensionPanel.tsx:150-157`); `validate-extension-render-owner` asserts `footer`
      is the only surface. Align the tool-`present` section with
      `packages/core/src/agent/tools/presentation/types.ts`.
- [x] 1.3 Re-read `demo-status.mjs`, `demo-pi-like.mjs`, `demo-echo-tool.mjs`, `demo-guard.mjs` against
      `ExtensionContext` and fix any remaining stale API. Confirm the existing validators that load these
      demos still pass (`validate:extension-pi-like`, `validate:extension-prompt-hooks`).

## 2. Skill registry write path

- [x] 2.1 `agent/skills/types.ts` — add `SkillSource = "builtin" | "user" | "project"`; add `source` to
      `skillSchema` and to `SkillSummary`; keep `skillSchema` the single shape authority.
- [x] 2.2 `agent/skills/skill-registry.ts` — add `register(skill: Skill)` and
      `registerAll(skills: readonly Skill[])`; both use first-wins.
- [x] 2.3 `agent/skills/skill-registry.ts` — make the duplicate-name skip observable (both the
      user-overrides-builtin case and the directory-collision case), keeping the existing precedence. The
      registry takes an optional `logger`; `agent-factory` wires it to the agent log (`log.warn("system", …)`).
- [x] 2.4 `agent/skills/skill-loader.ts` — tag directory-loaded skills with a source. The source is decided by
      `SkillRegistry.loadFromDirectories`, which takes `SkillDirectory` (`{ path, source }`) entries; a bare
      string still means `project`. `getDefaultSkillDirs()` (agent-manager) now returns tagged dirs:
      `AGENT_SKILL_DIRS` / `~/.agents/skills` → `user`, `.agents/skills` → `project`. An explicit
      `skillDirs` from the caller is `project` (backward compatible).
- [x] 2.5 `agent/skills/skill-registry.ts` — `clear()` also drops built-ins so a re-register is idempotent;
      asserted in `validate:builtin-skills`.

## 3. The `write-extension` built-in skill

- [x] 3.1 `agent/skills/builtin/index.ts` — export `BUILTIN_SKILLS: readonly Skill[]`.
- [x] 3.2 `agent/skills/builtin/write-extension.ts` — build the `Skill` object directly (no
      `parseFrontmatter`), `path: "builtin:write-extension"`, `source: "builtin"`, and a description short
      enough for the per-turn index.
- [x] 3.3 Body content in `builtin/write-extension.md.ts`, task-oriented rather than reference-dumped:
      what an extension can do; the three accepted module shapes; the five registration channels each with a
      minimal example; the full hook table and `prefix:*` matching; `present` + its purity rule;
      `ctx.ui.render` / `notify` / `getContext`; `ctx.coreEnv`; the load-and-verify loop; and a single
      copy-paste skeleton.
- [x] 3.4 Content verified against the implementation, and now **enforced** — `validate:builtin-skills`
      extracts every `ctx.<member>` / `ctx.ui.<member>` from the body and fails on any name absent from the
      real interface, so a rename breaks the build instead of the skill silently lying.
- [x] 3.5 Backticks and `${` escaped in the template literal; the body was split into `write-extension.md.ts`
      precisely to keep both files under the 400-line budget.
- [x] 3.6 Hook-name guard ships as two checks in `validate:builtin-skills`: every dispatched hook must appear
      in the body, and the bus source must still implement `pattern.endsWith("*")` (the prefix-wildcard claim
      the skill makes). Sabotage-tested: renaming `session:shutdown` in the body fails with
      `hook "session:shutdown" is not documented`.

## 4. Wiring

- [x] 4.1 `managers/agent-factory.ts` — after the directory load, `skillRegistry.registerAll(BUILTIN_SKILLS)`
      unless `skillsConfig?.builtinsDisabled`. Verified end to end by the new bootstrap block in
      `validate-local-agent-session.mjs` (sabotage-tested: removing the call fails
      "bootstrap registers every built-in skill").
- [x] 4.2 `agent/skills/extension.ts` — `SkillsExtensionConfig.builtinsDisabled`; `source` surfaced in the
      `<skills>` index and in `list_skills`. All four surfaces (index, `list_skills`, `load_skill`, `/skill`)
      filter consistently, so a disabled built-in is not reachable by name either.
- [x] 4.3 `agent/skills/index.ts` — exports `BUILTIN_SKILLS`, `SkillSource`, `SkillDirectory` and the registry
      config types (also re-exported from `dev.ts` for validators).
- [x] 4.4 `ManagedAgentConfig.skills` accepts the widened shape; `config.skills` is forwarded through
      `create-agent` → `CreateAgentOptions` → the remote-session server unchanged, and the field is part of the
      already-forwarded object rather than a new one.

## 5. Validation and CI

- [x] 5.1 Shipped as its own script, `packages/core/scripts/validate-builtin-skills.mjs`
      (`validate:builtin-skills`), rather than bloating `validate-skills-extension.mjs`: schema conformance,
      name uniqueness, non-empty description/body, size budget, `register`/`registerAll`/`clear`, override
      reported, `source` attribution, and the `builtinsDisabled` switch across all four surfaces.
- [x] 5.2 `validate-skills-extension.mjs` still passes untouched. It had *already* been asserting against
      its own explicit `.agents/skills` path rather than relying on a total count, so built-ins cannot mask a
      regression there; the dedicated `source` assertions moved to the new script.
- [x] 5.3 `.github/workflows/ci.yml` — new step "Validate the built-in skills" after `Test`, running
      `pnpm --filter @codent/core run validate:builtin-skills`. YAML re-parsed to confirm the step list is
      intact.
- [x] 5.4 **The validator list is only a list.** Checked before relying on a new entry: `validate:*` scripts
      are manual, CI runs exactly two `codent-cli` checks, and nothing enumerates `packages/core`'s scripts
      programmatically. Adding the `package.json` entry plus the explicit CI step is what actually gates it.

## 6. Docs and release

- [x] 6.1 `validate:self-contained` and `validate:runtime-specifiers` both pass after `build:codent` with **no**
      change to `packages/codent` (`files`, `dependencies`, copy script, allowlists). The skill body and
      `registerAll(BUILTIN_SKILLS)` are both visible inside `codent/dist`.
- [x] 6.2 Verified as far as is honestly possible without a TTY: the bundle contains the body, the
      `registerAll(BUILTIN_SKILLS)` call site, and `builtinNames`; `node packages/codent/dist/index.mjs --help`
      exits 0; and the bootstrap path is asserted by `validate-local-agent-session.mjs` against a real
      `AgentManager`. **Not** verified: a live TUI session listing it via `/skill` and the `Ctrl+Y` panel — no
      headless flag exists, so this remains a manual check.
- [x] 6.3 `examples/extensions/README.md` now opens with a pointer to the built-in `write-extension` skill as
      the canonical guide, framing the demos as runnable samples rather than the reference.

## 7. Follow-ups (not part of this change)

- [ ] 7.1 **Manual TUI verification.** Run a real `codent` session and confirm `write-extension` appears in
      `/skill` (no args) and the `Ctrl+Y` panel, and that disabling it there removes it. No automated
      substitute exists today.
- [ ] 7.2 **Only one core validator is in CI.** This change wires `validate:builtin-skills`; the other ~160
      `packages/core` validators still run only by hand. Worth its own change — wiring all of them would
      materially lengthen CI and needs a decision on tiering (always-run vs. path-filtered).
