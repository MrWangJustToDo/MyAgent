## ADDED Requirements

### Requirement: Runtime tool registration
The system SHALL allow extensions to register custom tools at runtime via `api.registerTool()`.

#### Scenario: Extension registers a tool
- **WHEN** an extension calls `api.registerTool({ name: "my_tool", execute: ... })`
- **THEN** the tool SHALL be available for LLM invocation in subsequent agent turns

#### Scenario: Tool uses Zod schema
- **WHEN** `api.registerTool()` is called with Zod `inputSchema` and `outputSchema`
- **THEN** the extension tool SHALL use Zod for schema validation (no TypeBox migration)

#### Scenario: Tool override
- **WHEN** an extension registers a tool with the same name as a built-in tool
- **THEN** the extension's tool definition SHALL replace the built-in (last registered wins)

#### Scenario: Tool appears in tool listing
- **WHEN** an extension registers a tool
- **THEN** the tool SHALL appear in the agent's tool set and be selectable by the LLM

### Requirement: toUI callback
Custom tools SHALL support an optional `toUI` callback that returns a display string for the terminal UI.

#### Scenario: Tool provides toUI
- **WHEN** a tool defines `toUI: ({ output }) => string`
- **THEN** `formatToolOutput()` in the app layer SHALL use the returned string instead of default formatting

#### Scenario: Tool does not provide toUI
- **WHEN** a tool does not define `toUI`
- **THEN** `formatToolOutput()` SHALL fall through to existing per-tool-name formatting logic

#### Scenario: toUI supports ANSI colors
- **WHEN** `toUI` returns a string with ANSI color codes (via chalk)
- **THEN** the terminal UI SHALL render the ANSI colored output

### Requirement: toUIRegistry
The system SHALL maintain a `toUIRegistry` mapping tool names to their `toUI` callbacks, parallel to the existing `toModelOutputRegistry`.

#### Scenario: toUI registered alongside toModelOutput
- **WHEN** a `defineServerTool()` config includes both `toModelOutput` and `toUI`
- **THEN** the tool SHALL be registered in both registries

#### Scenario: Registry queried by app
- **WHEN** the app's `formatToolOutput()` is called for a tool with `toUI`
- **THEN** it SHALL look up the `toUIRegistry` before falling through to the hardcoded switch

### Requirement: needsApproval in extension tools
The system SHALL support `needsApproval` in extension-registered tools, identical to built-in tool semantics.

#### Scenario: Extension tool requires approval
- **WHEN** an extension registers a tool with `needsApproval: true`
- **THEN** the tool SHALL enter the approval flow before execution, just like built-in tools
