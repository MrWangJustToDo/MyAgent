import { useEffect, useRef } from "react";

import { cx } from "../ui/cx.js";
import { IconCommand, IconSearch } from "../ui/icons.js";
import { useDismissable } from "../ui/use-dismissable.js";

export interface Command {
  id: string;
  title: string;
  /** Grouping label shown in the row and matched by search. */
  group: string;
  /** Extra search terms that are not shown. */
  keywords?: string;
  /** Displayed on the right of the row. */
  shortcut?: string;
  run: () => void;
}

/** Case-insensitive match over title, group and hidden keywords. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter((c) => `${c.title} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(q));
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Already filtered by the caller so the highlight index can be clamped there. */
  commands: Command[];
  query: string;
  onQueryChange: (query: string) => void;
  /** Keyboard-driven highlight only. Hovering must not change this. */
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
}

/**
 * Presentational command palette.
 *
 * The highlight is split by input source, and they must stay split:
 *
 * - **Keyboard** owns `activeIndex` and is the only thing allowed to scroll the
 *   list (`Enter` runs whatever is highlighted).
 * - **Pointer hover** is pure CSS (`:hover`). It deliberately does *not* go
 *   through React state, because hovering then re-rendered the whole list — which
 *   is what made the row appear to move/settle on hover. Hover and the keyboard
 *   highlight are also allowed to disagree; they only need to agree on `Enter`.
 */
export const CommandPalette = ({
  open,
  onClose,
  commands,
  query,
  onQueryChange,
  activeIndex,
  onActiveIndexChange,
}: CommandPaletteProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useDismissable(open, onClose);
  // Only keyboard navigation scrolls the list. Scrolling in response to a pointer
  // can move the row out from under the cursor.
  const scrollOnNextRender = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (!scrollOnNextRender.current) return;
    scrollOnNextRender.current = false;
    listRef.current?.querySelector<HTMLElement>(".palette__item--active")?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, commands.length]);

  if (!open) return null;

  const move = (delta: number) => {
    if (commands.length === 0) return;
    scrollOnNextRender.current = true;
    onActiveIndexChange((activeIndex + delta + commands.length) % commands.length);
  };

  return (
    <div
      className="overlay overlay--top"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={containerRef} className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette__search">
          <IconSearch size={14} />
          <input
            className="palette__input"
            value={query}
            autoFocus
            placeholder="Search commands…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={commands[activeIndex] ? `palette-item-${commands[activeIndex]!.id}` : undefined}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              } else if (e.key === "Home") {
                e.preventDefault();
                scrollOnNextRender.current = true;
                onActiveIndexChange(0);
              } else if (e.key === "End") {
                e.preventDefault();
                scrollOnNextRender.current = true;
                onActiveIndexChange(Math.max(0, commands.length - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                commands[activeIndex]?.run();
              }
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div ref={listRef} className="palette__list" id="palette-list" role="listbox" aria-label="Commands">
          {commands.length === 0 ? (
            <div className="palette__empty">No matching commands</div>
          ) : (
            commands.map((command, i) => (
              <button
                key={command.id}
                id={`palette-item-${command.id}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className={cx("palette__item", i === activeIndex && "palette__item--active")}
                onClick={() => command.run()}
              >
                <IconCommand size={13} />
                <span className="palette__item-title truncate">{command.title}</span>
                <span className="palette__item-group">{command.group}</span>
                {command.shortcut && <kbd>{command.shortcut}</kbd>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
