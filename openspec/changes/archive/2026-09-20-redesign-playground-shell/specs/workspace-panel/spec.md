# workspace-panel Specification (delta)

## MODIFIED Requirements

### Requirement: Multi-tab panel header

The workspace panel SHALL have a header with a tab bar containing at least the "Preview", "Variants"
and "Code" tabs. Only one tab is active at a time, and the tab bar SHALL be operable by keyboard.

#### Scenario: Tab bar visible

- **WHEN** the workspace panel renders
- **THEN** a tab bar is shown at the top of the panel
- **AND** the "Preview", "Variants" and "Code" tabs are all accessible
- **AND** clicking a tab switches the body content
- **AND** arrow keys move between tabs and `Home` / `End` jump to the first and last tab

#### Scenario: Preview tab shows the active port

- **WHEN** the "Preview" tab is active
- **THEN** the panel body shows the preview iframe for the selected port, with reload / open / copy actions
- **AND** WebContainer port events continue to add port tabs and mark readiness
- **AND** when no port is listening, an empty-state message is shown instead of a blank frame

### Requirement: Code tab with file tree and editor

The "Code" tab SHALL display a split view: a file tree sidebar on the left and a Monaco editor on the
right. The file tree SHALL be navigable by keyboard.

#### Scenario: File tree shows WebContainer directory

- **WHEN** the Code tab is activated
- **THEN** the file tree reads the WebContainer project root
- **AND** displays directories and files using JetBrains-style icons from `public/assets/icons/`
- **AND** directories are collapsible/expandable
- **AND** clicking a file opens its content in the Monaco editor

#### Scenario: File tree keyboard navigation

- **WHEN** the file tree has focus on a row
- **THEN** `ArrowUp` / `ArrowDown` move between visible rows
- **AND** `ArrowRight` expands a directory, `ArrowLeft` collapses it
- **AND** `Enter` opens the focused file
- **AND** only the focused row is in the tab order

#### Scenario: Expansion survives an agent write

- **WHEN** the agent writes a file while one or more directories are expanded
- **THEN** the expanded directories stay expanded
- **AND** the tree does not reset to a loading placeholder

## ADDED Requirements

### Requirement: Workspace Panel visibility

The playground SHALL present the workspace panel as a resizable side pane on regular and wide
viewports, and as an overlay sheet on compact viewports. Panel visibility SHALL be a persisted user
preference, toggled from the top bar, the command palette, or the settings dialog.

#### Scenario: Panel renders as a side pane

- **WHEN** the viewport is at or above the regular threshold and the panel is enabled
- **THEN** the workspace panel is visible as a right-side pane
- **AND** the splitter is draggable and keyboard-resizable, with a persisted width preference

#### Scenario: Panel renders as a sheet

- **WHEN** the viewport is below the compact threshold and the panel is enabled
- **THEN** the workspace panel is presented as an overlay sheet anchored to the bottom edge
- **AND** it can be dismissed without changing the persisted enabled preference

#### Scenario: No floating toggle

- **WHEN** the workspace panel is visible
- **THEN** no floating `PreviewToggle` bubble appears
- **AND** visibility is controlled only from shell affordances

### Requirement: Editor theme matches the shell

The Monaco editor SHALL use a theme derived from the shell design tokens.

#### Scenario: Editor theme matches the shell

- **WHEN** a file is opened
- **THEN** the editor background matches the shell surface token
- **AND** the accent token is used for selection and focus
- **AND** the language mode is auto-detected from the file extension
- **AND** the editor is read-write (user can edit)

## REMOVED Requirements

### Requirement: Workspace Panel always visible

**Reason**: The panel is no longer unconditionally visible. It is now a user preference that renders
as a side pane on regular/wide viewports and as an overlay sheet on compact viewports, so
"always visible" is false — and the requirement it stated (no mechanism may hide the panel) directly
contradicts the responsive behaviour and the explicit dismissal path.

**Migration**: Replaced by "Workspace Panel visibility" (above), which keeps the persisted
visibility preference and the draggable splitter while adding the compact-viewport sheet. The
`PreviewToggle` floating-button prohibition is carried over unchanged.
