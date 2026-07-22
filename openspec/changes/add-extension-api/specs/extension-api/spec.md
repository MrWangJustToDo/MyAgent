## ADDED Requirements

### Requirement: Extension API surface
The system SHALL provide an `ExtensionAPI` object passed as the default export parameter of every extension module.

#### Scenario: Extension receives ExtensionAPI
- **WHEN** an extension module's default export function is called
- **THEN** it receives an `ExtensionAPI` object with `on()`, `registerTool()`, `registerCommand()` methods

#### Scenario: Extension cannot register after load
- **WHEN** an extension's factory function completes execution
- **THEN** any further calls to `registerTool()` or `registerCommand()` SHALL throw

### Requirement: ExtensionContext
The system SHALL provide an `ExtensionContext` object as the second parameter to every event handler registered via `api.on()`.

#### Scenario: Event handler receives context
- **WHEN** an extension event handler is invoked
- **THEN** it receives an `ExtensionContext` with `cwd`, `ui`, `sessionManager`, `signal`, `abort()`, `shutdown()`, `compact()` properties

#### Scenario: UI methods are no-ops in headless mode
- **WHEN** `hasUI` is `false`
- **THEN** `ctx.ui.notify()`, `ctx.ui.setStatus()`, `ctx.ui.setWidget()` SHALL silently swallow calls

### Requirement: Extension loader
The system SHALL discover and load extensions from well-known directories at agent bootstrap time.

#### Scenario: Project-local extension loaded
- **WHEN** a `.ts` or `.js` file exists in `.opencode/extensions/`
- **THEN** it SHALL be loaded via dynamic `import()` and its default export function invoked with `ExtensionAPI`

#### Scenario: User-global extension loaded
- **WHEN** a `.ts` or `.js` file exists in `~/.config/opencode/extensions/`
- **THEN** it SHALL be loaded after project-local extensions

#### Scenario: Programmatic extension factories
- **WHEN** extension factories are passed programmatically via `ManagedAgentConfig.extensions`
- **THEN** they SHALL be invoked after filesystem extensions

#### Scenario: No extensions found
- **WHEN** no extension files or factories are configured
- **THEN** the agent SHALL operate normally without any extension system overhead

### Requirement: Extension runner
The system SHALL manage extension lifecycle through an `ExtensionRunner` that coordinates event dispatch and tool registration.

#### Scenario: Extensions registered before runner build
- **WHEN** tools are registered via `registerTool()` during extension load
- **THEN** they SHALL be available in the agent's tool set when the agent runner is built

#### Scenario: Runner provides scoped context
- **WHEN** an event handler or tool execution references `ctx.cwd`
- **THEN** it SHALL reflect the current workspace root path

### Requirement: Hook system migration to built-in extension
The existing `.agent-hooks/hooks.json` system SHALL be bridged to the extension event bus as a built-in extension, maintaining backward compatibility.

#### Scenario: Hook script continues to work
- **WHEN** a user has `.agent-hooks/hooks.json` with `PreToolUse` hooks
- **THEN** those hooks SHALL continue to execute via the built-in extension bridge without user migration

#### Scenario: Extension handler runs before hook script
- **WHEN** both a user extension handler and a hook script subscribe to `tool_call`
- **THEN** the extension handler SHALL execute first, followed by the hook script

#### Scenario: hooks-middleware replaced
- **WHEN** the agent middleware pipeline is constructed
- **THEN** `hooks-middleware.ts` SHALL no longer be used; replaced by `extensions-middleware.ts`
