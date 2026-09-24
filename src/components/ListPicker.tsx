import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
 * The menu first shows only the languages ("English", "Italian", "Pali"),
 * each with its list count; clicking a language expands its lists inline
 * (one language open at a time). Clicking a list selects it. The menu
 * closes on selection, outside click, ESC, or the picker button. There is
 * deliberately no hover behavior: hover-driven open/close caused menus to
 * shut under the cursor (see git history).
 */
export function ListPicker({ lists, listId, onList }: ListPickerProps) {
  const [open, setOpen] = useState(false);
  /** Which language's lists are expanded (one at a time; null = collapsed). */
  const [openLang, setOpenLang] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeList = lists.find((l) => l.id === listId);
  const activeLang = activeList ? listLanguage(activeList) : null;

  // Group lists by language, in first-seen order (file order in
  // BUILT_IN_FILES is followed for bundled lists).
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

  // Close the menu when clicking anywhere else on the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // While the menu is open, raise the whole config bar above the typing
  // area: both create their own stacking contexts (backdrop-filter), so the
  // menu's own z-index cannot escape the config bar's.
  useEffect(() => {
    const bar = rootRef.current?.closest(".config");
    if (!bar) return;
    bar.classList.toggle("list-picker-open", open);
    return () => bar.classList.remove("list-picker-open");
  }, [open]);

  // Keep the freshly expanded language's lists inside the scrolling menu.
  useEffect(() => {
    if (!open || !openLang) return;
    rootRef.current
      ?.querySelector('[aria-expanded="true"] ~ .lp-lists, .lp-group.open .lp-lists')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, openLang]);

  const select = (id: string) => {
    onList(id);
    setOpen(false);
  };

  return (
    <div
      className="list-picker"
      ref={rootRef}
      role="group"
      aria-label="Word list"
      style={{ "--lp-menu-max-h": "min(26rem, 65vh)" } as CSSProperties}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={`list-picker-btn${activeList ? "" : " placeholder"}`}
        onClick={() => {
          setOpen((v) => !v);
          // Opening always starts fully collapsed: languages only.
          setOpenLang(null);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        title="Choose a word list"
      >
        {activeLang ?? "lists"} <span className="list-picker-count">({activeList?.words.length ?? 0})</span>
      </button>

      {open && (
        <div className="list-picker-menu" role="menu" aria-label="Word lists">
          {groups.map((g) => {
            const expanded = g.language === openLang;
            const hasActive = g.lists.some((l) => l.id === listId);
            return (
              <div key={g.language} className={`lp-group${expanded ? " open" : ""}${hasActive ? " has-active" : ""}`}>
                <button
                  type="button"
                  className={`lp-language${hasActive ? " active" : ""}`}
                  onClick={() => setOpenLang((cur) => (cur === g.language ? null : g.language))}
                  aria-expanded={expanded}
                  aria-haspopup="true"
                >
                  <span className="lp-lang-name">{g.language}</span>
                  <span className="lp-lang-count">{g.lists.length}</span>
                  <span className="lp-arrow" aria-hidden="true">›</span>
                </button>
                {expanded && (
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
