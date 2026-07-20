## ADDED Requirements

### Requirement: Workspace Panel always visible

The playground SHALL display a right-side workspace panel at all times, separated from the terminal area by a draggable splitter (`SplitPane`).

#### Scenario: Panel renders on load
- **WHEN** the playground mounts
- **THEN** the workspace panel is visible as a right-side panel
- **AND** the splitter is draggable, with a persisted width preference

#### Scenario: No floating toggle
- **WHEN** the workspace panel is visible
- **THEN** no `PreviewToggle` floating button appears
- **AND** no mechanism hides the panel (it is always shown)

### Requirement: Multi-tab panel header

The workspace panel SHALL have a header with a tab bar containing at least the "Preview" and "Code" tabs. Only one tab is active at a time.

#### Scenario: Tab bar visible
- **WHEN** the workspace panel renders
- **THEN** a tab bar is shown at the top of the panel
- **AND** the "Preview" tab and "Code" tab are both accessible
- **AND** clicking a tab switches the body content

#### Scenario: Preview tab preserves existing behavior
- **WHEN** the "Preview" tab is active
- **THEN** the panel body shows exactly the existing preview iframe (port tabs, refresh/open/copy/close actions), except the "Close" button which is replaced by no-op or removed since the panel is always visible
- **AND** WebContainer port events continue to auto-open port tabs and mark readiness
- **AND** when no ports exist, the placeholder message is shown

### Requirement: Code tab with file tree and editor

The "Code" tab SHALL display a VS Code-style split: a file tree sidebar on the left and a Monaco editor on the right.

#### Scenario: File tree shows WebContainer directory
- **WHEN** the Code tab is activated
- **THEN** the file tree reads the WebContainer root (`/home/workspace`) recursively
- **AND** displays directories and files using JetBrains-style icons from `public/assets/icons/`
- **AND** directories are collapsible/expandable
- **AND** clicking a file opens its content in the Monaco editor

#### Scenario: Monaco editor with GitHub dark theme
- **WHEN** a file is opened
- **THEN** the Monaco editor displays the file content
- **AND** uses a GitHub dark theme (e.g. `github-dark-default`)
- **AND** the language mode is auto-detected from the file extension
- **AND** the editor is read-write (user can edit)

### Requirement: Monaco save to WebContainer

The Monaco editor SHALL save modified content back to the WebContainer filesystem.

#### Scenario: Ctrl+S saves
- **WHEN** the user presses Ctrl+S / Cmd+S while editing in Monaco
- **THEN** the content is written to the WebContainer file via `fs.writeFile`
- **AND** a brief "Saved" indicator appears

#### Scenario: Tab switch auto-saves
- **WHEN** the user switches from the Code tab to the Preview tab (or vice versa)
- **THEN** the currently open file, if modified, is auto-saved to WebContainer before the tab switch

### Requirement: Agent action auto-refresh

The file tree and Monaco editor SHALL automatically refresh when the agent performs file writes or runs commands through CoreEnv, without causing infinite refresh loops.

#### Scenario: File tree refreshes after agent write
- **WHEN** the agent calls `fs.writeFile` via CoreEnv
- **THEN** the file tree re-reads the affected directory
- **AND** the editor, if showing the written file, re-reads the new content

#### Scenario: File tree refreshes after agent command
- **WHEN** an agent `run_command` completes
- **THEN** the file tree re-reads the root directory
- **AND** any open editor file is re-read from disk

#### Scenario: No loop from refresh reads
- **WHEN** the auto-refresh reads files from WebContainer
- **THEN** these read operations MUST NOT trigger another auto-refresh
- **AND** only write operations and command executions (from agent tools) trigger the refresh

### Requirement: JetBrains icons for file tree

The file tree SHALL use the existing JetBrains icon set in `public/assets/` for file and folder icons, mapping file extensions to the appropriate SVG icon.

#### Scenario: Common file types have icons
- **WHEN** a `.ts`, `.js`, `.tsx`, `.jsx`, `.css`, `.json`, `.md` file is shown
- **THEN** the corresponding JetBrains icon SVG is displayed next to the filename

#### Scenario: Unknown file types use fallback
- **WHEN** a file type has no matching icon
- **THEN** the generic `text_dark.svg` icon is used

#### Scenario: Folder icons vary by name
- **WHEN** a folder named `src`, `test`, `node_modules`, etc. is shown
- **THEN** the corresponding JetBrains folder icon variant is displayed
- **AND** unknown folders use the default `folder_dark.svg`

## REMOVED Requirements

### Requirement: PreviewToggle

**Reason**: The workspace panel is always visible, so the floating toggle button is no longer needed.

**Migration**: The `PreviewToggle` component and its CSS are removed. Port-based auto-open behavior moves to the Preview tab's port tab logic.
