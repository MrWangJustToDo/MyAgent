# playground-shell Specification

## ADDED Requirements

### Requirement: Unified application shell

The playground SHALL render a single application shell consisting of a top bar, a work area, and a
status bar. The shell SHALL be the only host chrome outside the terminal.

#### Scenario: Shell renders around the terminal

- **WHEN** the playground mounts
- **THEN** a top bar is rendered above the work area
- **AND** a status bar is rendered below the work area
- **AND** the terminal occupies the remaining space in the work area

#### Scenario: No floating settings bubble

- **WHEN** the playground renders in any state
- **THEN** no draggable floating settings control is present
- **AND** settings are reachable from the top bar and from `Cmd/Ctrl+,`

### Requirement: Shared UI primitives

Every playground control outside the terminal SHALL be built from one shared primitive set
(`Button`, `IconButton`, `Field`, `Input`, `Select`, `Switch`, `Segmented`, `Dialog`, `Sheet`) rather
than surface-specific control styles.

#### Scenario: Controls share one visual language

- **WHEN** a button appears in the top bar, the workspace panel, a dialog, or the variants panel
- **THEN** it renders the same variant/size combinations from the shared primitive layer
- **AND** focus, hover, active and disabled states are defined once

#### Scenario: Icon-only controls are labelled

- **WHEN** a control renders without a visible text label
- **THEN** it has an accessible name (`aria-label` or `title`)
- **AND** keyboard focus reaches it

### Requirement: Responsive layout

The shell SHALL adapt to viewport size through a single breakpoint owner, with no layout-structure
decisions made in ad-hoc component media queries.

#### Scenario: Compact viewport uses a sheet

- **WHEN** the viewport is below the compact threshold
- **THEN** the workspace panel is presented as an overlay sheet rather than a side pane
- **AND** the top bar collapses action labels to icons or an overflow menu
- **AND** no element overflows the viewport horizontally

#### Scenario: Regular and wide viewports use a resizable pane

- **WHEN** the viewport is at or above the regular threshold
- **THEN** the workspace panel is a side pane
- **AND** the splitter resizes it within its min/max bounds
- **AND** the width preference is persisted across reloads

#### Scenario: Narrower viewports never break the terminal

- **WHEN** the viewport shrinks below the compact threshold
- **THEN** the terminal's font size is unchanged (it does not scale continuously)
- **AND** the terminal reflows to the box it is given
- **AND** the terminal is not remounted on resize or on a pane drag

#### Scenario: The running agent survives a layout change

- **WHEN** the viewport crosses the compact threshold while a run is in progress
- **THEN** the terminal is relocated between the side-pane and sheet layouts
- **AND** the agent is restarted by the relocation rather than left in a broken state

### Requirement: Keyboard-operable shell

The shell SHALL provide keyboard paths for its primary actions.

#### Scenario: Command palette

- **WHEN** the user presses `Cmd/Ctrl+K`
- **THEN** a command palette opens listing host actions
- **AND** typing filters the list, arrow keys move the selection, `Enter` runs it, and `Escape` closes it

#### Scenario: Settings shortcut

- **WHEN** the user presses `Cmd/Ctrl+,`
- **THEN** the settings dialog opens

#### Scenario: Splitters are resizable by keyboard

- **WHEN** a splitter has focus
- **THEN** it exposes `role="separator"` with `aria-valuenow`
- **AND** arrow keys resize the adjacent pane within its bounds
- **AND** double-clicking it restores the default width

### Requirement: Overlay dismissal contract

`Dialog` and `Sheet` SHALL share one dismissal contract.

#### Scenario: Consistent close behaviour

- **WHEN** an overlay is open and the user presses `Escape` or activates the backdrop
- **THEN** the overlay closes
- **AND** focus returns to the control that opened it

### Requirement: Layered stylesheet

Playground styles SHALL be organized into token, base, primitive, and feature layers.

#### Scenario: No duplicate or dead control styles

- **WHEN** the stylesheet is reviewed
- **THEN** tokens are defined only in the token layer
- **AND** no compatibility-alias block exists
- **AND** selectors with no emitter in the playground source are removed

### Requirement: Terminal sizing

The terminal SHALL NOT remount in response to resize or pane-drag events.

#### Scenario: Resize does not remount the terminal

- **WHEN** the viewport or the workspace pane is resized without crossing the compact threshold
- **THEN** the terminal instance is preserved
- **AND** scrollback is retained

#### Scenario: Breakpoint columns are display-only

- **WHEN** the breakpoint changes
- **THEN** the status bar reports the column budget for that size class
- **AND** that budget is not written into the terminal options
