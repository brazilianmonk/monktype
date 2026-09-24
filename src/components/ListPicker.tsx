import { useEffect, useMemo, useRef, useState } from "react";
import type { WordList } from "../types";
import { listLanguage } from "../data/lists";

interface ListPickerProps {
  lists: WordList[];
  listId: string;
  onList: (id: string) => void;
}

interface LanguageGroup {
  language: string;
  lists: WordList[];
}

/**
 * Language-grouped replacement for the flat word-list <select>.
 *
 * The control shows only languages at the top level ("English (n)", "Italian
 * (n)"…), which keeps the bar compact even with dozens of lists. Hovering (or
 * focusing / tapping) a language opens a flyout with that language's lists;
 * clicking a list selects it.
 */
/** Estimated menu width (min-width 15rem + padding) plus a safety margin. */
const MENU_WIDTH = 256 + 16;

export function ListPicker({ lists, listId, onList }: ListPickerProps) {
  // Starts fully collapsed (all language rows closed) so every language is
  // equally visible; hover/click opens one flyout at a time.
  const [openLang, setOpenLang] = useState<string | null>(null);
  /** Menu opens leftward instead of rightward when there is no room. */
  const [flip, setFlip] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const activeList = lists.find((l) => l.id === listId);
  const activeLang = activeList ? listLanguage(activeList) : null;

  // Group lists by language, in first-seen order (English first by convention:
  // file order in BUILT_IN_FILES is followed for bundled lists).
  const groups = useMemo<LanguageGroup[]>(() => {
    const map = new Map<string, WordList[]>();
    for (const l of lists) {
      const lang = listLanguage(l);
      const arr = map.get(lang) ?? [];
      arr.push(l);
      map.set(lang, arr);
    }
    return [...map.entries()].map(([language, ls]) => ({ language, lists: ls }));
  }, [lists]);

  // Close the flyout when clicking anywhere else on the page.
  useEffect(() => {
    if (!openLang) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenLang(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [openLang]);

  // While the menu is open, keep the sideways orientation valid on resize.
  useEffect(() => {
    if (!openLang) return;
    const updateFlip = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      setFlip(!!rect && rect.right + MENU_WIDTH > window.innerWidth);
    };
    updateFlip();
    window.addEventListener("resize", updateFlip);
    return () => window.removeEventListener("resize", updateFlip);
  }, [openLang]);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    // Long enough for a diagonal trip between the menu and a flyout across
    // the small gap between them; short enough to feel snappy.
    closeTimer.current = window.setTimeout(() => setOpenLang(null), 220);
  };

  useEffect(() => cancelClose, []);

  const select = (id: string) => {
    onList(id);
    setOpenLang(null);
  };

  return (
    <div
      className="list-picker"
      ref={rootRef}
      role="group"
      aria-label="Word list"
      onKeyDown={(e) => {
        if (e.key === "Escape" && openLang) {
          e.stopPropagation();
          setOpenLang(null);
        }
      }}
    >
      <button
        type="button"
        className={`list-picker-btn${activeList ? "" : " placeholder"}`}
        onClick={() => setOpenLang((v) => (v ? null : "__first__"))}
        aria-haspopup="true"
        aria-expanded={openLang !== null}
        title="Choose a word list"
      >
        {activeLang ?? "lists"} <span className="list-picker-count">({activeList?.words.length ?? 0})</span>
      </button>

      {openLang !== null && (
        <div className={`list-picker-menu${flip ? " flipped" : ""}`} role="menu">
          {groups.map((g, gi) => {
            const isOpen = g.language === openLang || (openLang === "__first__" && gi === 0);
            const hasActive = g.lists.some((l) => l.id === listId);
            return (
              <div
                key={g.language}
                className={`lp-group${isOpen ? " open" : ""}${hasActive ? " has-active" : ""}`}
                onMouseEnter={() => {
                  cancelClose();
                  setOpenLang(g.language);
                }}
                onMouseLeave={scheduleClose}
              >
                <button
                  type="button"
                  className={`lp-language${hasActive ? " active" : ""}`}
                  onClick={() => {
                    // Click OPENS the group (never toggles): on a mouse the
                    // hover has usually already opened it, so a toggle here
                    // would close the whole menu the moment the user clicks
                    // the language row. Closing is done via outside click,
                    // ESC, the picker button, or selecting a list.
                    cancelClose();
                    setOpenLang(g.language);
                  }}
                  aria-expanded={isOpen}
                >
                  <span className="lp-lang-name">{g.language}</span>
                  <span className="lp-lang-count">{g.lists.length}</span>
                  <span className="lp-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
                {isOpen && (
                  <div className="lp-lists" role="listbox" aria-label={`${g.language} word lists`}>
                    {g.lists.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        role="option"
                        aria-selected={l.id === listId}
                        className={`lp-list${l.id === listId ? " active" : ""}`}
                        onClick={() => select(l.id)}
                        title={`${l.name} — ${l.words.length} words`}
                      >
                        <span className="lp-list-name">{l.name}</span>
                        <span className="lp-list-count">{l.words.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
