# Change: Ship a built-in skill that teaches users to write codent extensions

## Why

The extension system is one of the most capable surfaces in this codebase — five registration channels
(`registerTool` / `registerCommand` / `registerInterceptor` / `registerContextProvider` /
`registerMessageTransformer`), a generic render surface, lifecycle hooks, and full `CoreEnv` access — but it
is reachable only by users who already know the API. Nothing in a published `codent-cli` install teaches it:

- core's own `codent-skills` extension ships the skill *framework* and explicitly no content
  (`agent/skills/extension.ts:12-14` — "registers no scripts/assets");
- skill discovery only ever reads the user's own directories (`~/.agents/skills`, `.agents/skills`,
  `AGENT_SKILL_DIRS` — `managers/agent-manager.ts:39-61`), so a fresh install has zero skills;
- the only extension documentation lives in `examples/extensions/`, which is not published and is not loaded
  by default (`examples/extensions/README.md:3`).

A built-in `write-extension` skill closes that gap: the agent always knows the extension API, the correct
hook names, and the two documentation traps that currently mislead it, so "add a tool that does X" becomes a
one-shot task instead of a research project.

## What Changes

- **NEW — a built-in skill mechanism.** `packages/core/src/agent/skills/builtin/<name>.ts` exporting
  `BUILTIN_SKILLS: readonly Skill[]` from `builtin/index.ts`. Content is TypeScript constants, so tsdown
  inlines it into the `codent-cli` tarball and the published-package contract is unchanged: no new `files`
  entry, no copy script, no `validate:self-contained` assertion, no new runtime dependency.
- **NEW — the first built-in skill: `write-extension`.** A task-oriented guide covering the module shape
  (accepted `normalizeExtensionExport` forms — `extension/loader.ts:33-70`), all five registration channels,
  the complete hook list, `ctx.ui.render` surfaces, `present` for tool display, a copy-pasteable skeleton,
  and the load/verify loop (`--extension-dirs` / `AGENT_EXTENSION_DIRS` / `Ctrl+Y`).
- **The skill ships only corrected claims.** `examples/extensions/` contradicts the current API in two places
  that a skill would otherwise teach verbatim, so the skill is gated on fixing them (tasks §2).
- **`SkillRegistry` gains a write path.** `register(skill)` / `registerAll(skills)` — today the only entry
  point is `loadFromDirectories()` (`skill-registry.ts:60`).
- **Built-in priority is lowest.** `registerAll(BUILTIN_SKILLS)` runs *after* directory loading
  (`managers/agent-factory.ts:143`), reusing the existing first-wins rule, so
  `AGENT_SKILL_DIRS` > `~/.agents/skills` > `.agents/skills` > built-in: a user skill always overrides a
  built-in of the same name. This is the reverse of the extension-discovery order
  (`extension/paths.ts:16-20`, where later wins) and is deliberate — the bundled default must never shadow
  the user's own file.
- **Silent override becomes visible.** `skill-registry.ts:67-73` drops a duplicate name with a bare
  `continue`. With built-ins in play, both "user overrides built-in" and "two user dirs collide" must emit a
  log line, or a missing skill is undiagnosable.
- **`Skill.source`** (`"builtin" | "user" | "project"`) is added and surfaced in both the `<skills>` index
  (`extension.ts:141-151`) and `list_skills` output, so the model can tell the two apart.
- **Built-ins are switchable.** `SkillsExtensionConfig.builtinsDisabled: true` (i.e.
  `config.skills: { builtinsDisabled: true }`) drops them entirely, matching the existing
  `toolsDisabled` / `indexDisabled` shape.

## Not In Scope

- Built-ins without a config switch, or the ability to *disable* a specific built-in by name — a single
  all-or-nothing flag is enough for the first built-in.
- Any other built-in skill.
- Shipping `.md` assets with the package, writing into `~/.agents/skills`, or a remote skill registry.
- A `/extensions`-style new slash command or panel (the existing `Ctrl+Y` panel already covers enable/disable).

## Impact

- Affected specs: `builtin-skills` (new capability)
- Affected code:
  - `packages/core/src/agent/skills/` — `builtin/` (new), `skill-registry.ts`, `types.ts`, `extension.ts`, `index.ts`
  - `packages/core/src/managers/agent-factory.ts` (wiring after directory load)
  - `examples/extensions/README.md`, `examples/extensions/demo-turn-context.mjs` (two stale claims the skill depends on)
  - `packages/core/package.json` + `packages/core/scripts/validate-skills-extension.mjs` (extended validator)
  - `.github/workflows/ci.yml` (run that validator — currently CI runs no `@codent/core` validator at all,
    only the two `codent-cli` release checks)
