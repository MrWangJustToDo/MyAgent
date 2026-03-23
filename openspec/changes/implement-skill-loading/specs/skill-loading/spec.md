## ADDED Requirements

### Requirement: Skill file parsing
The system SHALL parse `SKILL.md` files with YAML frontmatter format. Frontmatter MUST be delimited by `---` lines and contain at minimum `name` and `description` fields. Content after the closing `---` is the skill body.

#### Scenario: Valid SKILL.md with frontmatter
- **WHEN** SkillLoader encounters a file with valid YAML frontmatter containing name and description
- **THEN** the skill is loaded with metadata extracted from frontmatter and body from remaining content

#### Scenario: SKILL.md without frontmatter
- **WHEN** SkillLoader encounters a SKILL.md file without `---` delimiters
- **THEN** the file is treated as body-only with name derived from parent directory name and empty description

#### Scenario: Invalid YAML in frontmatter
- **WHEN** SkillLoader encounters a SKILL.md with malformed YAML between `---` delimiters
- **THEN** the skill is skipped and a warning is logged

### Requirement: Skill directory scanning
The system SHALL scan configured directories recursively for `SKILL.md` files. Each skill is identified by its parent directory name as the skill ID.

#### Scenario: Nested skill directories
- **WHEN** SkillLoader scans a directory containing `skills/git-workflow/SKILL.md`
- **THEN** a skill with ID `git-workflow` is registered

#### Scenario: Multiple skill directories
- **WHEN** SkillLoader is configured with multiple directories `[".opencode/skills", "custom/skills"]`
- **THEN** skills from all directories are loaded and available

#### Scenario: Non-existent directory
- **WHEN** SkillLoader is configured with a directory that does not exist
- **THEN** the directory is skipped without error and an empty skill set is returned for that path

#### Scenario: Duplicate skill names across directories
- **WHEN** the same skill name exists in multiple configured directories
- **THEN** the first loaded skill takes precedence and a warning is logged

### Requirement: Skill registry management
The system SHALL provide a SkillRegistry that manages loaded skills and provides lookup methods.

#### Scenario: List all skills
- **WHEN** `registry.list()` is called
- **THEN** an array of all loaded skills with their metadata (name, description) is returned

#### Scenario: Get skill by name
- **WHEN** `registry.get("skill-name")` is called with a valid skill name
- **THEN** the full skill object including body content is returned

#### Scenario: Get non-existent skill
- **WHEN** `registry.get("unknown-skill")` is called with an invalid name
- **THEN** undefined is returned

### Requirement: list_skills tool
The system SHALL provide a `list_skills` tool that returns available skill names and descriptions for agent discovery.

#### Scenario: List available skills
- **WHEN** agent calls `list_skills` tool with no parameters
- **THEN** a formatted list of skill names and descriptions is returned

#### Scenario: No skills available
- **WHEN** agent calls `list_skills` and no skills are loaded
- **THEN** a message indicating no skills are available is returned

### Requirement: load_skill tool
The system SHALL provide a `load_skill` tool that returns the full content of a skill wrapped in XML-style tags.

#### Scenario: Load existing skill
- **WHEN** agent calls `load_skill` with `name: "git-workflow"`
- **THEN** the full skill body is returned wrapped as `<skill name="git-workflow">...</skill>`

#### Scenario: Load non-existent skill
- **WHEN** agent calls `load_skill` with a name that doesn't exist
- **THEN** an error message is returned listing available skill names

### Requirement: Configurable skill directories
The system SHALL support configurable skill directories via agent configuration with a default of `.opencode/skills` relative to the root path.

#### Scenario: Default skill directory
- **WHEN** agent is created without explicit `skillDirs` config
- **THEN** skills are loaded from `.opencode/skills` relative to rootPath

#### Scenario: Custom skill directories
- **WHEN** agent is created with `skillDirs: ["./my-skills", "/absolute/path/skills"]`
- **THEN** skills are loaded from both specified directories

#### Scenario: Relative paths resolved to rootPath
- **WHEN** agent has rootPath `/project` and skillDirs `["./skills"]`
- **THEN** skills are loaded from `/project/skills`
