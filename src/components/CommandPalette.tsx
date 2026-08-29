import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordList } from "../types";
import type { WordOrder } from "../hooks/useTypingTest";
import { WORD_COUNTS } from "./ConfigBar";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  lists: WordList[];
  listId: string;
  onSelectList: (id: string) => void;
  wordCount: number;
  onSelectCount: (n: number) => void;
  peek: boolean;
  onTogglePeek: () => void;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
  order: WordOrder;
  onOrder: (o: WordOrder) => void;
}

interface Command {
  id: string;
  label: string;
  category: string;
  keywords: string[];
  active?: boolean;
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  lists,
  listId,
  onSelectList,
  wordCount,
  onSelectCount,
  peek,
  onTogglePeek,
  autoSpeak,
  onToggleAutoSpeak,
  order,
  onOrder,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Word lists
    for (const l of lists) {
      cmds.push({
        id: `list:${l.id}`,
        label: l.name,
        category: "Word List",
        keywords: [l.name.toLowerCase(), `${l.words.length} words`],
        active: l.id === listId,
        action: () => {
          onSelectList(l.id);
          onClose();
        },
      });
    }

    // Word counts
    for (const n of WORD_COUNTS) {
      cmds.push({
        id: `count:${n}`,
        label: `${n} words`,
        category: "Word Count",
        keywords: [`${n}`, `${n} words`, "count"],
        active: n === wordCount,
        action: () => {
          onSelectCount(n);
          onClose();
        },
      });
    }

    // Order
    cmds.push({
      id: "order:random",
      label: "Random order",
      category: "Order",
      keywords: ["random", "shuffle", "order"],
      active: order === "random",
      action: () => {
        onOrder("random");
        onClose();
      },
    });
    cmds.push({
      id: "order:sequence",
      label: "In order",
      category: "Order",
      keywords: ["sequence", "order", "sequential"],
      active: order === "sequence",
      action: () => {
        onOrder("sequence");
        onClose();
      },
    });

    // Feature toggles
    cmds.push({
      id: "toggle:peek",
      label: peek ? "Hide meaning while typing" : "Show meaning while typing",
      category: "Features",
      keywords: ["peek", "meaning", "show", "hide", "toggle"],
      active: peek,
      action: () => {
        onTogglePeek();
        onClose();
      },
    });
    cmds.push({
      id: "toggle:speak",
      label: autoSpeak ? "Disable auto-pronounce" : "Enable auto-pronounce",
      category: "Features",
      keywords: ["speak", "pronounce", "audio", "sound", "voice", "toggle"],
      active: autoSpeak,
      action: () => {
        onToggleAutoSpeak();
        onClose();
      },
    });

    return cmds;
  }, [lists, listId, wordCount, peek, autoSpeak, order, onSelectList, onSelectCount, onTogglePeek, onToggleAutoSpeak, onOrder, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((cmd) =>
      terms.every(
        (t) =>
          cmd.label.toLowerCase().includes(t) ||
          cmd.category.toLowerCase().includes(t) ||
          cmd.keywords.some((k) => k.includes(t))
      )
    );
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: { category: string; items: Command[] }[] = [];
    let lastCat = "";
    for (const cmd of filtered) {
      if (cmd.category !== lastCat) {
        groups.push({ category: cmd.category, items: [] });
        lastCat = cmd.category;
      }
      groups[groups.length - 1].items.push(cmd);
    }
    return groups;
  }, [filtered]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      // Small delay so the DOM is ready
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Keep active item in view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-cmd-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // ESC is handled by the global handler in App.tsx — don't handle it
      // here to avoid a close/reopen race between two listeners.
      if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(1, filtered.length));
      }
      if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) cmd.action();
      }
    },
    [filtered, activeIndex]
  );

  // Global ESC to open (handled in App) — this is just for the palette's own ESC

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <span className="palette-search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="palette-empty">No matching commands</div>
          )}
          {grouped.map((group) => (
            <div key={group.category} className="palette-group">
              <div className="palette-group-label">{group.category}</div>
              {group.items.map((cmd) => {
                const idx = flatIndex++;
                return (
                  <div
                    key={cmd.id}
                    data-cmd-index={idx}
                    className={`palette-item${idx === activeIndex ? " active" : ""}${cmd.active ? " selected" : ""}`}
                    onClick={cmd.action}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <span className="palette-item-label">{cmd.label}</span>
                    {cmd.active && <span className="palette-item-check">✓</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="palette-footer">
          <kbd>↑↓</kbd> navigate · <kbd>enter</kbd> select · <kbd>esc</kbd> close
        </div>
      </div>
    </div>
  );
}
