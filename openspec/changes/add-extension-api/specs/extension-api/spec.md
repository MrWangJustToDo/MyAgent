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

#### Scenario: Host provides Zod on context
- **WHEN** an extension `activate(ctx)` runs
- **THEN** `ctx.z` SHALL be the host Zod `z` API (same version as core); extensions SHALL NOT need to import `zod`

#### Scenario: UI methods are no-ops in headless mode
- **WHEN** `hasUI` is `false`
- **THEN** `ctx.ui.notify()`, `ctx.ui.setStatus()`, `ctx.ui.setWidget()` SHALL silently swallow calls

### Requirement: Extension loader
The system SHALL discover and load extensions from well-known directories at agent bootstrap time.

#### Scenario: Project-local extension loaded
- **WHEN** a `.ts` or `.js` file exists in `.agents/extension/`
- **THEN** it SHALL be loaded via dynamic `import()` and its default export function invoked with `ExtensionAPI`

#### Scenario: User-global extension loaded
- **WHEN** a `.ts` or `.js` file exists in `~/.agents/extension/`
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

### Requirement: No `.agent-hooks` / hook-script path
The system SHALL NOT load, bridge, or execute `.agent-hooks/hooks.json` or a HookRegistry/HookRunner. Customization SHALL use Extension modules (`.agents/extension` or programmatic `config.extensions`) and `extensions-middleware.ts`.

#### Scenario: hooks-middleware not used
- **WHEN** the agent middleware pipeline is constructed
- **THEN** `hooks-middleware.ts` SHALL NOT be present; tool interception SHALL go through `extensions-middleware.ts` and `ExtensionRunner`

#### Scenario: legacy hook config is ignored
- **WHEN** a workspace still contains `.agent-hooks/hooks.json`
- **THEN** the agent SHALL NOT read or execute it
