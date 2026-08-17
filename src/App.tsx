import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ConfigBar, WORD_COUNTS } from "./components/ConfigBar";
import { Header } from "./components/Header";
import { LiveStats } from "./components/LiveStats";
import { Results } from "./components/Results";
import { SettingsModal } from "./components/SettingsModal";
import { Words } from "./components/Words";
import { addHistory } from "./data/history";
import { deleteCustomList, getCustomLists, loadFileLists } from "./data/lists";
import {
  DIFFICULT_REPEATS,
  MEMORIZE_INTRO_TESTS,
  useTypingTest,
  type WordOrder,
} from "./hooks/useTypingTest";
import type { BubbleInfo } from "./components/Words";
import type { MemorizeEntry, Theme, WordEntry, WordList } from "./types";
import { accuracy, netWpm, rawWpm } from "./utils/stats";

const THEME_KEY = "vocabtype:theme";
const COUNT_KEY = "vocabtype:wordCount";
const LIST_KEY = "vocabtype:listId";
const PEEK_KEY = "vocabtype:peek";
const ORDER_KEY = "vocabtype:order";
/** Per-list position for "in order" tests: list id → next word index. */
const PROGRESS_KEY = "vocabtype:progress";
/** `/`-marked words that recur in later tests to help memorize them. */
const MEMORIZE_KEY = "vocabtype:memorize";

/** Font size for the words area per word count. */
const FS_BY_COUNT: Record<number, string> = {
  10: "2rem",
  25: "2rem",
  50: "1.75rem",
  100: "1.5rem",
  250: "1.25rem",
  500: "1rem",
};

export default function App() {
  const [fileLists, setFileLists] = useState<WordList[]>([]);
  const [customLists, setCustomLists] = useState<WordList[]>([]);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [practiceSet, setPracticeSet] = useState<WordEntry[] | null>(null);

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" ? "light" : "dark";
  });
  const [wordCount, setWordCount] = useState<number>(() => {
    const saved = Number(localStorage.getItem(COUNT_KEY));
    return WORD_COUNTS.includes(saved) ? saved : 50;
  });
  const [listId, setListId] = useState<string>(() => localStorage.getItem(LIST_KEY) ?? "");
  const [peek, setPeek] = useState<boolean>(() => localStorage.getItem(PEEK_KEY) === "1");
  const [order, setOrder] = useState<WordOrder>(() =>
    localStorage.getItem(ORDER_KEY) === "sequence" ? "sequence" : "random"
  );
  const [progress, setProgress] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const [memorize, setMemorize] = useState<MemorizeEntry[]>(() => {
    try {
      const raw = localStorage.getItem(MEMORIZE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (m): m is MemorizeEntry =>
          m !== null &&
          typeof m === "object" &&
          typeof (m as MemorizeEntry).word === "string" &&
          typeof (m as MemorizeEntry).intro === "number"
      );
    } catch {
      return [];
    }
  });

  // Load bundled lists (public/words/*.json) plus imported custom lists.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { lists, failed } = await loadFileLists();
      if (cancelled) return;
      setFileLists(lists);
      setCustomLists(getCustomLists());
      setFailedFiles(failed);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(COUNT_KEY, String(wordCount));
  }, [wordCount]);

  useEffect(() => {
    localStorage.setItem(PEEK_KEY, peek ? "1" : "0");
  }, [peek]);

  useEffect(() => {
    localStorage.setItem(ORDER_KEY, order);
  }, [order]);

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem(MEMORIZE_KEY, JSON.stringify(memorize));
  }, [memorize]);

  const allLists = useMemo(() => [...fileLists, ...customLists], [fileLists, customLists]);
  const activeList = allLists.find((l) => l.id === listId) ?? allLists[0] ?? null;
  // Memoized so an empty list keeps a stable reference (otherwise the typing
  // test effect would restart on every render while lists are still loading).
  const listWords = useMemo(() => activeList?.words ?? [], [activeList]);

  // Remember the effective list selection across reloads.
  useEffect(() => {
    localStorage.setItem(LIST_KEY, activeList?.id ?? "");
  }, [activeList?.id]);

  const testWords = practiceSet ?? listWords;
  const testCount = practiceSet
    ? practiceSet.length
    : Math.min(wordCount, Math.max(1, listWords.length));
  // Practice sets are always picked randomly; the "in order" offset only
  // applies to the normal word-list flow, and memorize words are not mixed
  // into mistake practice.
  const testOrder: WordOrder = practiceSet ? "random" : order;
  const testOffset = practiceSet ? 0 : (progress[activeList?.id ?? ""] ?? 0);
  const testMemorize = practiceSet ? [] : memorize;

  // `/`-marked words toggle in/out of the memorize list (persisted).
  const handleMemorize = useCallback((entry: WordEntry) => {
    setMemorize((prev) => {
      if (prev.some((m) => m.word === entry.word)) {
        return prev.filter((m) => m.word !== entry.word);
      }
      return [
        ...prev,
        {
          word: entry.word,
          meaning: entry.meaning,
          ...(entry.ipa ? { ipa: entry.ipa } : {}),
          intro: MEMORIZE_INTRO_TESTS,
        },
      ];
    });
  }, []);

  const test = useTypingTest(testWords, testCount, testOrder, testOffset, testMemorize, handleMemorize);

  const typedChars = test.stats.correct + test.stats.errors + test.stats.extra;
  const liveWpm = netWpm(test.stats.correct, test.elapsedMs);
  const liveAcc = accuracy(test.stats.correct, typedChars);

  // The meaning bubble floats above the word being read. In the default mode
  // it shows the just-finished word's meaning above the next word, and fades
  // out as soon as typing resumes (or after a short pause). In peek mode it
  // shows the current word's meaning above that word while typing.
  const [bubbleExpired, setBubbleExpired] = useState(false);
  useEffect(() => {
    if (peek) {
      setBubbleExpired(false);
      return;
    }
    if (!test.lastMeaning) return;
    setBubbleExpired(false);
    const id = window.setTimeout(() => setBubbleExpired(true), 3000);
    return () => window.clearTimeout(id);
  }, [peek, test.lastMeaning]);

  const bubble = useMemo<BubbleInfo | null>(() => {
    if (loading || test.status === "finished" || test.words.length === 0) return null;
    if (peek) {
      const entry = test.words[test.wordIndex];
      if (!entry) return null;
      return {
        word: entry.word,
        meaning: entry.meaning,
        ipa: entry.ipa ?? "",
        targetIndex: test.wordIndex,
        visible: true,
        animate: false,
      };
    }
    if (!test.lastMeaning) return null;
    const typingStarted = (test.typed[test.wordIndex] ?? "").length > 0;
    return {
      word: test.lastMeaning.word,
      meaning: test.lastMeaning.meaning,
      ipa: test.lastMeaning.ipa ?? "",
      targetIndex: test.wordIndex,
      visible: !bubbleExpired && !typingStarted,
      animate: true,
    };
  }, [loading, test.status, peek, test.words, test.wordIndex, test.lastMeaning, test.typed, bubbleExpired]);

  // Save one history entry per completed test.
  const lastSavedRef = useRef("");
  useEffect(() => {
    // Reset the guard once the test leaves the finished state, so a repeated
    // test with identical stats is still recorded.
    if (test.status !== "finished") {
      lastSavedRef.current = "";
      return;
    }
    if (test.completions.length === 0) return;
    const key = `${test.words.length}-${test.stats.correct}-${test.stats.errors}-${Math.round(test.elapsedMs)}`;
    if (lastSavedRef.current === key) return;
    lastSavedRef.current = key;
    addHistory({
      date: Date.now(),
      listId: activeList?.id ?? "",
      listName: practiceSet ? `practice: ${activeList?.name ?? ""}` : (activeList?.name ?? ""),
      count: test.words.length,
      wpm: liveWpm,
      raw: rawWpm(typedChars, test.elapsedMs),
      acc: liveAcc,
      errors: test.stats.errors,
      durationMs: test.elapsedMs,
    });
  }, [test.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImported = (list: WordList) => {
    setCustomLists((prev) => [...prev, list]);
    setListId(list.id);
    setPracticeSet(null);
  };

  const handleDeleted = (id: string) => {
    deleteCustomList(id);
    const remaining = customLists.filter((l) => l.id !== id);
    setCustomLists(remaining);
    setPracticeSet(null);
    setListId((cur) => (cur === id ? remaining[0]?.id ?? fileLists[0]?.id ?? "" : cur));
  };

  const handleCount = (n: number) => {
    setPracticeSet(null);
    setWordCount(n);
  };

  const handleList = (id: string) => {
    setPracticeSet(null);
    setListId(id);
  };

  const handleNewTest = () => {
    if (practiceSet) {
      setPracticeSet(null);
      return;
    }
    if (order === "sequence") {
      // Advance the per-list position; the hook picks the next segment from
      // the new offset, continuing where the last test left off.
      const id = activeList?.id ?? "";
      setProgress((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + testCount }));
    } else {
      test.newTest();
    }
  };

  // Keep a fresh reference so the Enter shortcut below always calls the
  // latest handleNewTest without re-attaching the listener every render.
  const handleNewTestRef = useRef(handleNewTest);
  useEffect(() => {
    handleNewTestRef.current = handleNewTest;
  });

  // Enter anywhere starts a new test (same as the "new test" button). It is
  // ignored while the settings modal is open and on controls that handle
  // Enter themselves (buttons, selects, links, text fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || settingsOpen) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag === "BUTTON" || tag === "SELECT" || tag === "A") return;
      if (el.isContentEditable) return;
      // Let real text fields keep their Enter; the hidden typing input is fine.
      if ((tag === "INPUT" || tag === "TEXTAREA") && !el.classList.contains("hidden-input")) return;
      e.preventDefault();
      handleNewTestRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const handlePracticeMistakes = () => {
    const mistakes = test.completions
      .filter((c) => c.errors > 0)
      .map((c) => c.entry);
    if (mistakes.length > 0) setPracticeSet(mistakes);
  };

  // Each finished test that included a memorize copy consumes one intro slot
  // (the word appears once per intro test, then 3× per test afterward). Only
  // counts actual memorize copies (not the word appearing in the base list).
  useEffect(() => {
    if (test.status !== "finished" || practiceSet) return;
    setMemorize((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((m) => {
        if (m.intro <= 0) return m;
        const appeared = test.words.some((w) => w.word === m.word && w.memorize);
        if (!appeared) return m;
        changed = true;
        return { ...m, intro: m.intro - 1 };
      });
      return changed ? next : prev;
    });
  }, [test.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeSettings = () => {
    setSettingsOpen(false);
    test.focusInput();
  };

  return (
    <div className="app">
      <div className="container">
        <Header
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {!loading && (
          <ConfigBar
            count={practiceSet ? practiceSet.length : wordCount}
            onCount={handleCount}
            lists={allLists}
            listId={activeList?.id ?? ""}
            onList={handleList}
            peek={peek}
            onTogglePeek={() => setPeek((p) => !p)}
            order={order}
            onOrder={setOrder}
            practice={
              practiceSet
                ? { label: `practicing mistakes (${practiceSet.length})`, onExit: () => setPracticeSet(null) }
                : undefined
            }
            onNewTest={handleNewTest}
          />
        )}
      </div>

      <main className="container">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <p>Loading word lists…</p>
          </div>
        ) : test.status === "finished" ? (
          <Results
            completions={test.completions}
            correctChars={test.stats.correct}
            errorChars={test.stats.errors}
            extraChars={test.stats.extra}
            elapsedMs={test.elapsedMs}
            totalWords={test.words.length}
            listName={practiceSet ? "mistakes practice" : (activeList?.name ?? "")}
            onRestart={test.restart}
            onNewTest={handleNewTest}
            onPracticeMistakes={handlePracticeMistakes}
          />
        ) : (
          <div
            className="typing-area"
            style={{ "--fs": FS_BY_COUNT[practiceSet ? testWords.length : wordCount] ?? "1.5rem" } as CSSProperties}
            onClick={test.focusInput}
          >
            <input
              ref={test.inputRef}
              className="hidden-input"
              onInput={test.onInput}
              onKeyDown={test.onKeyDown}
              aria-label="Typing input"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Words
              words={test.words}
              typed={test.typed}
              activeIndex={test.wordIndex}
              bubble={bubble}
            />
            <LiveStats
              elapsedMs={test.elapsedMs}
              wpm={liveWpm}
              acc={liveAcc}
              done={test.completions.length}
              total={test.words.length}
              onNewTest={handleNewTest}
            />
          </div>
        )}

        {failedFiles.length > 0 && (
          <p className="footer-warning">
            Could not load bundled list(s): {failedFiles.join(", ")} — check that the files exist in{" "}
            <code>public/words/</code>.
          </p>
        )}
      </main>

      <footer className="container footer">
        <span>
          <kbd>space</kbd> finish a word · <kbd>tab</kbd> restart · <kbd>enter</kbd> new test ·{" "}
          <kbd>⌫</kbd> at the start of a word goes back
        </span>
        <span>
          <kbd>*</kbd> drills a word {DIFFICULT_REPEATS}× now · <kbd>/</kbd> memorizes it for later
          tests · word lists load from <code>public/words/</code> and your browser storage
        </span>
      </footer>

      {settingsOpen && (
        <SettingsModal
          lists={allLists}
          onClose={closeSettings}
          onImported={handleImported}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
