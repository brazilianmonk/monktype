import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Completion, MemorizeEntry, WordEntry } from "../types";
import { netWpm } from "../utils/stats";
import { stripTrailingMarkers, toChars } from "../utils/text";

export type TestStatus = "idle" | "running" | "finished";

/** How words are picked for a test: shuffled randomly, or sequentially. */
export type WordOrder = "random" | "sequence";

/** How many extra times a `word*` (difficult) word is repeated. */
export const DIFFICULT_REPEATS = 3;

/** Intro tests where a `/`-marked word appears once before being repeated. */
export const MEMORIZE_INTRO_TESTS = 3;

export interface TypingStats {
  correct: number;
  errors: number;
  extra: number;
}

export interface TypingTest {
  words: WordEntry[];
  status: TestStatus;
  wordIndex: number;
  /** What the user typed for each word (only indices <= wordIndex are meaningful). */
  typed: string[];
  completions: Completion[];
  /** The most recently finished word, shown in the meaning panel. */
  lastMeaning: WordEntry | null;
  elapsedMs: number;
  stats: TypingStats;
  inputRef: React.RefObject<HTMLInputElement>;
  onInput: (e: React.FormEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  restart: () => void;
  newTest: () => void;
  focusInput: () => void;
}

/**
 * Build the words for a test.
 * - "random": shuffle the whole list and take the first `count`.
 * - "sequence": take `count` words starting at `offset`, wrapping around the
 *   end of the list. The offset is advanced (in App) each time a new test
 *   starts, so sequential tests continue where the previous one left off.
 */
export function pickWords(
  list: WordEntry[],
  count: number,
  order: WordOrder = "random",
  offset = 0
): WordEntry[] {
  if (order === "sequence") {
    const n = list.length;
    const take = Math.min(count, n);
    const res: WordEntry[] = [];
    for (let i = 0; i < take; i++) {
      res.push(list[(offset + i) % n]);
    }
    return res;
  }
  const n = Math.min(count, list.length);
  const pool = list.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/**
 * How the difficult-word queue changes after finishing a word.
 * Returns the number of repeat copies to insert right after it and the new
 * count of copies still queued ahead. `next` <= 0 means the word leaves the
 * queue (all repeats consumed or never queued).
 */
export function planDifficulty(
  starred: boolean,
  existing: number,
  repeats: number = DIFFICULT_REPEATS
): { copies: number; next: number } {
  if (starred) {
    // The current copy (if any) is consumed first, then re-arm the queue to
    // `repeats` — so re-starring a word restores "3 more times".
    const queuedAfterThis = Math.max(0, existing - 1);
    return { copies: Math.max(0, repeats - queuedAfterThis), next: repeats };
  }
  const rest = existing - 1;
  return { copies: 0, next: rest };
}

/**
 * Mix `/`-marked (memorized) words into a picked test at random positions:
 *  - while `intro` > 0 the word appears once per test (spaced introduction)
 *  - once introduced, it appears `DIFFICULT_REPEATS`× per test
 */
export function mixMemorize(base: WordEntry[], memorize: MemorizeEntry[]): WordEntry[] {
  if (memorize.length === 0) return base;
  const out = base.slice();
  for (const m of memorize) {
    const copies = m.intro > 0 ? 1 : DIFFICULT_REPEATS;
    const entry: WordEntry = {
      word: m.word,
      meaning: m.meaning,
      ...(m.ipa ? { ipa: m.ipa } : {}),
      memorize: true,
    };
    for (let c = 0; c < copies; c++) {
      const pos = Math.floor(Math.random() * (out.length + 1));
      out.splice(pos, 0, entry);
    }
  }
  return out;
}

export function useTypingTest(
  list: WordEntry[],
  count: number,
  order: WordOrder = "random",
  offset = 0,
  /** `/`-marked words to mix into tests (pass [] in practice mode). */
  memorize: MemorizeEntry[] = [],
  /** Called when the user finishes a word with a trailing `/`. */
  onMemorize?: (entry: WordEntry) => void
): TypingTest {
  const [words, setWords] = useState<WordEntry[]>(() =>
    mixMemorize(pickWords(list, count, order, offset), memorize)
  );
  const [status, setStatus] = useState<TestStatus>("idle");
  const [wordIndex, setWordIndex] = useState(0);
  const [typed, setTyped] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [lastMeaning, setLastMeaning] = useState<WordEntry | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * word → how many repeat copies are still queued up ahead. Only drives the
   * insertion logic, so it lives in a ref (no rendering depends on it).
   */
  const difficultRef = useRef<Record<string, number>>({});
  /**
   * Latest memorize list. Read at generation time only, so marking a word
   * mid-test does not restart the current test — it shows up in later ones.
   */
  const memorizeRef = useRef(memorize);
  useEffect(() => {
    memorizeRef.current = memorize;
  }, [memorize]);

  const resetAll = useCallback((fresh: WordEntry[]) => {
    difficultRef.current = {};
    setWords(fresh);
    setStatus("idle");
    setWordIndex(0);
    setTyped(Array(fresh.length).fill(""));
    setStartTime(null);
    setNow(0);
    setCompletions([]);
    setLastMeaning(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // Start a fresh test whenever the list, word count, order or sequence
  // offset changes.
  useEffect(() => {
    resetAll(mixMemorize(pickWords(list, count, order, offset), memorizeRef.current));
  }, [list, count, order, offset, resetAll]);

  // Tick the clock while the test is running.
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const elapsedMs = startTime === null ? 0 : now - startTime;

  const stats = useMemo<TypingStats>(() => {
    let correct = 0;
    let errors = 0;
    let extra = 0;
    for (let i = 0; i <= wordIndex && i < words.length; i++) {
      // Trailing `*` / `/` are flags, not part of the word.
      const tChars = toChars(stripTrailingMarkers(typed[i] ?? ""));
      const wChars = toChars(words[i].word);
      for (let j = 0; j < tChars.length; j++) {
        if (j < wChars.length) {
          if (tChars[j] === wChars[j]) correct++;
          else errors++;
        } else {
          extra++;
        }
      }
      // Finished words with skipped letters count them as errors.
      if (i < wordIndex && tChars.length < wChars.length) {
        errors += wChars.length - tChars.length;
      }
    }
    return { correct, errors, extra };
  }, [typed, wordIndex, words]);

  const finishWord = useCallback(() => {
    const entry = words[wordIndex];
    if (!entry) return;
    const raw = typed[wordIndex] ?? "";
    // `word*` drills it now; `word/` memorizes it for later tests.
    const starred = raw.endsWith("*");
    const memorizeMarked = raw.endsWith("/");
    const t = starred || memorizeMarked ? stripTrailingMarkers(raw) : raw;
    const tChars = toChars(t);
    const wChars = toChars(entry.word);
    let wordErrors = 0;
    for (let j = 0; j < tChars.length; j++) {
      if (j >= wChars.length || tChars[j] !== wChars[j]) wordErrors++;
    }
    // Skipped letters count as errors too.
    if (tChars.length < wChars.length) wordErrors += wChars.length - tChars.length;
    const elapsed = startTime === null ? 0 : performance.now() - startTime;
    // Keep the displayed clock accurate when the test ends.
    setNow(performance.now());
    const completion: Completion = {
      entry,
      typed: t,
      errors: wordErrors,
      t: elapsed,
      wpm: netWpm(stats.correct, elapsed),
    };
    setCompletions((prev) => [...prev, completion]);
    setLastMeaning(entry);

    if (memorizeMarked) {
      // Word should recur in later tests — App toggles it in the list.
      onMemorize?.(entry);
    }

    // Difficult-word handling. Starring a word inserts DIFFICULT_REPEATS
    // copies right after it; typing a copy normally consumes one; starring it
    // again resets the queue back to DIFFICULT_REPEATS.
    const difficult = difficultRef.current;
    const existing = difficult[entry.word] ?? 0;
    const { copies, next } = planDifficulty(starred, existing);
    if (next > 0) difficult[entry.word] = next;
    else delete difficult[entry.word];

    const nextWords = copies > 0 ? words.slice() : words;
    const nextTyped = typed.slice();
    if (copies > 0) {
      const rep: WordEntry = { ...entry, repeat: true };
      const inserts = Array.from({ length: copies }, () => rep);
      nextWords.splice(wordIndex + 1, 0, ...inserts);
      nextTyped.splice(wordIndex + 1, 0, ...Array.from({ length: copies }, () => ""));
    }
    setWords(nextWords);

    const nextIndex = wordIndex + 1;
    if (nextIndex < nextWords.length) nextTyped[nextIndex] = "";
    setTyped(nextTyped);

    if (nextIndex >= nextWords.length) {
      setStatus("finished");
    } else {
      setWordIndex(nextIndex);
    }
    if (inputRef.current) inputRef.current.value = "";
  }, [words, wordIndex, typed, startTime, stats, onMemorize]);

  const onInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      // Entries may be multi-word phrases (e.g. "to get") whose inner space
      // is part of the entry, so keep single spaces. Collapse any other
      // whitespace (tabs/newlines from pasted text) to one space and drop a
      // leading one.
      const raw = e.currentTarget.value;
      const value = raw.replace(/\s+/g, " ").replace(/^ /, "");
      if (value !== raw) e.currentTarget.value = value;
      setTyped((prev) => {
        const next = prev.slice();
        next[wordIndex] = value;
        return next;
      });
      if (startTime === null) {
        setStartTime(performance.now());
        setNow(performance.now());
        setStatus("running");
      }
    },
    [wordIndex, startTime]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") {
        // Restart with the same words.
        e.preventDefault();
        resetAll(words);
        return;
      }
      if (e.key === " ") {
        const t = typed[wordIndex] ?? "";
        const wChars = toChars(words[wordIndex]?.word ?? "");
        // Multi-word entries (e.g. "to get"): when the next expected character
        // is a space, let the space through so it becomes part of the typed
        // entry. Otherwise the space finishes the entry and never reaches the
        // input value.
        if (status === "running" && t.length < wChars.length && wChars[t.length] === " ") {
          return;
        }
        // Finish the current word. Space never reaches the input value.
        e.preventDefault();
        if (status === "running" && t.length > 0) {
          finishWord();
        }
        return;
      }
      if (e.key === "Backspace") {
        const input = e.currentTarget;
        // At the start of a word, go back to the previous word.
        if (input.value.length === 0 && wordIndex > 0 && status === "running") {
          e.preventDefault();
          const prev = wordIndex - 1;
          setWordIndex(prev);
          input.value = typed[prev] ?? "";
        }
        return;
      }
    },
    [words, status, typed, wordIndex, resetAll, finishWord]
  );

  const restart = useCallback(() => resetAll(words), [resetAll, words]);
  const newTest = useCallback(
    () => resetAll(mixMemorize(pickWords(list, count, order, offset), memorizeRef.current)),
    [resetAll, list, count, order, offset]
  );
  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  return {
    words,
    status,
    wordIndex,
    typed,
    completions,
    lastMeaning,
    elapsedMs,
    stats,
    inputRef,
    onInput,
    onKeyDown,
    restart,
    newTest,
    focusInput,
  };
}
