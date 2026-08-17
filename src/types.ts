export interface WordEntry {
  word: string;
  meaning: string;
  /**
   * IPA pronunciation, e.g. "/əˈbɪləti/". Mainly for English lists; leave
   * unset for other languages (e.g. Pali) and it will not be displayed.
   */
  ipa?: string;
  /**
   * Internal UI flag: true for the repeat copies inserted when a word is
   * marked difficult (typed with a trailing `*`). Never persisted.
   */
  repeat?: boolean;
  /**
   * Internal UI flag: true for copies of a memorized word (typed with a
   * trailing `/`) that are mixed into later tests. Never persisted.
   */
  memorize?: boolean;
}

/**
 * A `/`-marked word that should keep appearing in later tests to help
 * memorize it. While `intro` > 0 the word is included once per test (spaced
 * introduction); once `intro` reaches 0 it is included 3× per test until the
 * user un-memorizes it (typing `/` again).
 */
export interface MemorizeEntry {
  word: string;
  meaning: string;
  ipa?: string;
  /** Remaining "one copy per test" introduction tests. */
  intro: number;
}

export interface WordList {
  id: string;
  name: string;
  source: "file" | "custom";
  words: WordEntry[];
}

export type Theme = "dark" | "light";

/** A finished word within a test. */
export interface Completion {
  entry: WordEntry;
  /** What the user actually typed (may include extra characters). */
  typed: string;
  /** Number of incorrect characters in this word. */
  errors: number;
  /** Elapsed time at completion, in ms. */
  t: number;
  /** Net WPM at completion. */
  wpm: number;
}

/** A completed test, kept for the history view. */
export interface HistoryEntry {
  date: number;
  listId: string;
  listName: string;
  count: number;
  wpm: number;
  raw: number;
  acc: number;
  errors: number;
  durationMs: number;
}
