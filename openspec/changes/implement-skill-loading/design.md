## Context

The agent currently has a static system prompt. Domain-specific workflows (git conventions, testing patterns, code review checklists) would bloat the system prompt if included upfront. The reference implementation from `learn-claude-code` demonstrates a two-layer pattern:

1. **Layer 1 (System Prompt)**: Skill names + descriptions (~100 tokens/skill) - always present
2. **Layer 2 (Tool Result)**: Full skill content (~2000+ tokens) - loaded on-demand via tool

Existing skills are already defined in `.opencode/skills/` with `SKILL.md` files using YAML frontmatter. The infrastructure to use them is missing.

## Goals / Non-Goals

**Goals:**
- Implement two-layer skill injection matching the reference pattern
- Provide `list_skills` tool for on-demand skill discovery
- Provide `load_skill` tool to load full skill content
- Support configurable skill directories (not hardcoded paths)
- Parse existing `.opencode/skills/*/SKILL.md` format (YAML frontmatter + markdown body)

**Non-Goals:**
- Skill authoring/creation tools (users create SKILL.md files manually)
- Skill versioning or dependency management
- Remote skill repositories or package management
- Skill execution (skills are instructions, not runnable code)

## Decisions

### 1. SkillLoader as Standalone Module

**Decision:** Create `packages/core/src/agent/skills/` module with `SkillLoader` class that scans directories for `SKILL.md` files.

**Rationale:** Follows existing patterns (tools, subagent modules). Keeps skill logic isolated and testable.

**Alternatives considered:**
- Inline in AgentManager: Would bloat manager with parsing logic
- Config-file based: Less flexible, skills already use file-based format

### 2. YAML Frontmatter Format

**Decision:** Parse `SKILL.md` files with YAML frontmatter between `---` delimiters:
```yaml
---
name: skill-name
description: Brief description for discovery
license: MIT
compatibility: Requirements
metadata:
  author: name
  version: "1.0"
---
[Full skill content as markdown body]
```

**Rationale:** Matches existing `.opencode/skills/` format. Standard pattern (Jekyll, Hugo, etc.).

### 3. Tool-Based Discovery and Loading

**Decision:** Two tools following reference implementation:
- `list_skills`: Returns skill names + descriptions (Layer 1 data)
- `load_skill`: Returns full skill content wrapped in `<skill name="...">` tags

**Rationale:** 
- On-demand discovery per user requirement (agent calls `list_skills` first)
- Matches Claude Code pattern from reference
- Clear separation between discovery and loading

**Alternatives considered:**
- Single `skill` tool with subcommands: More complex input schema
- Auto-inject into system prompt: Violates on-demand requirement

### 4. SkillRegistry Pattern

**Decision:** `SkillRegistry` class manages loaded skills with methods:
- `loadFromDirectory(path)`: Scan and load skills
- `list()`: Return all skills (for `list_skills` tool)
- `get(name)`: Return specific skill content (for `load_skill` tool)
- `getDescriptions()`: Return formatted list for system prompt (optional future use)

**Rationale:** Registry pattern allows multiple directories, caching, and clean API for tools.

### 5. Configurable Skill Directories

**Decision:** Add `skillDirs?: string[]` to agent config. Default: `[".opencode/skills"]` relative to `rootPath`.

**Rationale:** Per user requirement - fully configurable. Allows project-specific and shared skill directories.

### 6. Skill Content Wrapping

**Decision:** `load_skill` returns content wrapped in XML-style tags:
```xml
<skill name="skill-name">
[Full skill body from SKILL.md]
</skill>
```

**Rationale:** Matches reference implementation. Clear context boundary for the model.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Large skill content bloats context | Skills are loaded on-demand; agent decides when to load |
| Invalid SKILL.md format | Graceful error handling, skip invalid files with warning |
| Missing skill directory | Return empty list, no error (directory may not exist yet) |
| Skill name conflicts across directories | First loaded wins, log warning for duplicates |
| Agent loads too many skills | Natural limit - context window will constrain usage |
