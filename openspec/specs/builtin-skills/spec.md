# builtin-skills Specification

## Purpose

Skills shipped with the package, so a fresh install has domain knowledge without the user writing a
`SKILL.md` first. Built-in content is TypeScript compiled into the bundle (not a `.md` asset), registered at
the lowest priority so a user's own skill of the same name always wins.

## Requirements

### Requirement: Built-in skill registry

The system SHALL provide a set of built-in skills, defined as TypeScript constants in
`packages/core/src/agent/skills/builtin/` and aggregated by `builtin/index.ts` as
`BUILTIN_SKILLS: readonly Skill[]`. Built-in skill content MUST be part of the compiled bundle, so that no
non-JavaScript asset has to be copied, resolved, or asserted in the published package.

`SkillRegistry` SHALL expose `register(skill: Skill)` and `registerAll(skills: readonly Skill[])` as the
write path for skills that did not come from a directory.

#### Scenario: Registry accepts a programmatically-registered skill

- **WHEN** `registerAll(BUILTIN_SKILLS)` is called on a freshly constructed `SkillRegistry`
- **THEN** every built-in skill is retrievable via `registry.get(name)`
- **AND** `registry.size` includes them

#### Scenario: Built-ins require no asset pipeline

- **WHEN** the `codent-cli` tarball is built
- **THEN** built-in skill content is present in `dist` as bundled JavaScript
- **AND** `validate:self-contained` and `validate:runtime-specifiers` pass without changes to their
  allowlists, assertions, or the `files` field
- **AND** no new runtime dependency is declared

#### Scenario: Every built-in is a well-formed skill

- **WHEN** `BUILTIN_SKILLS` is validated against `skillSchema`
- **THEN** every entry parses successfully
- **AND** every `name` is unique across the set and matches its directory/file identity
- **AND** every `description` is non-empty and each body is non-empty

### Requirement: Built-in skill precedence

Built-in skills SHALL have the lowest load priority. `registerAll(BUILTIN_SKILLS)` MUST run after
`loadFromDirectories()` has populated the registry, so the existing first-wins rule yields the order
`AGENT_SKILL_DIRS` > `~/.agents/skills` > `.agents/skills` > built-in.

A skill loaded from a directory MUST override a built-in skill of the same name. A built-in MUST NOT
override a user skill.

#### Scenario: User skill shadows a built-in of the same name

- **WHEN** a directory skill and a built-in share a name
- **THEN** `registry.get(name)` returns the directory skill's body
- **AND** the built-in's body is not reachable

#### Scenario: Built-in is available when no directory defines it

- **WHEN** no loaded directory defines a skill with the built-in's name
- **THEN** the built-in is available via `registry.get(name)` and appears in `registry.list()`

#### Scenario: Explicit `skillDirs` still overrides built-ins

- **WHEN** an agent is created with an explicit `skillDirs` list
- **THEN** built-ins are still registered at lowest priority
- **AND** a same-named skill in `skillDirs` wins

### Requirement: Duplicate skill names are reported

When a skill name is skipped because it is already registered, the system SHALL report the skip, naming both
the surviving skill's source and the shadowed one. A silent skip MUST NOT be the only observable outcome.

#### Scenario: User skill overriding a built-in is logged

- **WHEN** a directory skill shadows a built-in skill of the same name
- **THEN** a log entry names the skill and states that the built-in was overridden

#### Scenario: Two directory skills colliding is logged

- **WHEN** the same skill name appears in two loaded directories
- **THEN** a log entry names the skill and the shadowed source

### Requirement: Skill origin

A `Skill` SHALL carry a `source` of `"builtin" | "user" | "project"` describing where it was loaded from, and
the origin SHALL be observable to both the model and the user.

#### Scenario: Origin is visible in the model-facing index

- **WHEN** the `<skills>` turn-context index is rendered (`agent/skills/extension.ts`)
- **THEN** built-in entries are distinguishable from user and project entries

#### Scenario: Origin is visible to `list_skills`

- **WHEN** the agent calls `list_skills`
- **THEN** each returned entry carries its `source`

### Requirement: Built-in skills can be disabled

The skills extension SHALL accept `SkillsExtensionConfig.builtinsDisabled: true` (i.e.
`config.skills: { builtinsDisabled: true }`), which SHALL drop every built-in skill from the registry
while leaving directory-loaded skills untouched.

#### Scenario: Disabling built-ins keeps user skills

- **WHEN** an agent is created with `skills: { builtinsDisabled: true }`
- **THEN** no built-in skill is registered
- **AND** skills from `AGENT_SKILL_DIRS` / `~/.agents/skills` / `.agents/skills` are unaffected

#### Scenario: Built-ins are on by default

- **WHEN** an agent is created without a `skills` config
- **THEN** built-in skills are registered and listed

### Requirement: The `write-extension` built-in skill

The system SHALL ship a built-in skill named `write-extension` that teaches a user (through the agent) how to
write a codent extension. Its content MUST describe the API as implemented, specifically:

- the accepted module shapes (`ExtensionAPI` object, `ExtensionFactory`, `activate(ctx)` function);
- all five registration channels — `registerTool`, `registerCommand`, `registerInterceptor`,
  `registerContextProvider`, `registerMessageTransformer`;
- the complete set of interceptable hook names and their match semantics, including that a `prefix:*`
  pattern matches by prefix (so `tool:before:*` observes every tool);
- tool `present` display fields and the purity requirement;
- `ctx.ui.render(surface, key, payload)` (raw text or a `text` / `row` / `column` / `box` tree, `null`
  removes the slot), `ctx.ui.notify`, and `ctx.coreEnv` access;
- discovery and the verify loop (`AGENT_EXTENSION_DIRS`, `--extension-dirs`, the `Ctrl+Y` panel with
  per-extension enable/disable).

The skill MUST NOT document APIs that do not exist on `ExtensionContext`, and MUST NOT rely on demo files
that contradict the current API.

#### Scenario: Skill is discoverable and loadable

- **WHEN** an agent starts with built-ins enabled
- **THEN** `write-extension` appears in the `<skills>` index and in `list_skills`
- **AND** `load_skill` returns its full body

#### Scenario: Documented hook names exist

- **WHEN** every hook name and API mentioned in the skill's content is checked against the implementation
- **THEN** each is present
- **AND** no skill-mentioned API is absent from `ExtensionContext` / `ExtensionEventBus`

#### Scenario: Documented example files are consistent

- **WHEN** the skill references an example under `examples/extensions/`
- **THEN** that example uses only currently-valid APIs

### Requirement: Built-in skill validation

The system SHALL validate built-in skills in `packages/core/scripts/`, covering: `skillSchema` conformance,
name uniqueness, non-empty description and body, user-skill-over-built-in precedence, `source` attribution,
and the disable switch.

The validation MUST run in CI. Adding a validator that no workflow invokes is not acceptable — a check that
nobody runs is a check that rots.

#### Scenario: Validation is wired into CI

- **WHEN** a pull request is opened
- **THEN** the built-in skill validation runs in `.github/workflows/ci.yml`

#### Scenario: Validation fails on a broken built-in

- **WHEN** a built-in skill has an empty body, a duplicate name, or a name contradicting the documented
  content
- **THEN** the validation script exits non-zero with a message naming the offending skill
