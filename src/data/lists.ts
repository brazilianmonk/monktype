import type { WordEntry, WordList } from "../types";

/**
 * Bundled list files shipped in public/words/. To add your own bundled list:
 * 1. create public/words/<name>.json (see README for the format)
 * 2. add "<name>.json" to this array
 * The files are loaded with fetch at runtime, so you can edit them without
 * rebuilding — but a rebuild + redeploy is needed to ship changes.
 */
const BUILT_IN_FILES = ["english.json", "pali.json", "B2-group-1.json", "B2-group-2.json", "B2-group-3.json", "B2-group-4.json", "B2-group-5.json", "B2-group-6.json" ];

const CUSTOM_KEY = "vocabtype:customLists";

/**
 * Small built-in fallback so the app still works when opened straight from
 * disk (file://) where fetch of bundled lists is blocked by the browser.
 */
const FALLBACK: WordList = {
  id: "fallback",
  name: "Fallback",
  source: "file",
  words: [
    { word: "typing", meaning: "writing with a keyboard" },
    { word: "learning", meaning: "gaining knowledge or skill" },
    { word: "vocabulary", meaning: "the words of a language" },
    { word: "meaning", meaning: "what something signifies" },
    { word: "practice", meaning: "repeated exercise" },
    { word: "word", meaning: "a unit of language" },
    { word: "language", meaning: "a system of communication" },
    { word: "keyboard", meaning: "an input device with keys" },
  ],
};

/**
 * Accepts several shapes and normalizes them to a WordList:
 *  - { "name": "...", "words": [{ word, meaning }, ...] }
 *  - [{ word, meaning }, ...]
 *  - ["word1", "word2"]                     (no meanings)
 *  - { words: [...] } / { entries: [...] }
 */
export function normalizeList(raw: unknown, id: string): { list?: WordList; error?: string } {
  let name = "Imported list";
  let words: unknown;

  if (Array.isArray(raw)) {
    words = raw;
  } else if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    name = String(obj.name ?? obj.language ?? obj.title ?? "Imported list");
    words = obj.words ?? obj.entries ?? obj.items ?? [];
  } else {
    return { error: "The JSON must be an array of words or an object with a `words` array." };
  }

  if (!Array.isArray(words)) {
    return { error: "The JSON must be an array of words or an object with a `words` array." };
  }

  const entries: WordEntry[] = [];
  for (const item of words) {
    if (typeof item === "string") {
      const w = item.trim();
      if (w) entries.push({ word: w, meaning: "" });
      continue;
    }
    if (item !== null && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const w =
        (typeof rec.word === "string" && rec.word.trim()) ||
        (typeof rec.term === "string" && rec.term.trim()) ||
        "";
      if (!w) continue;
      const meaning =
        (typeof rec.meaning === "string" && rec.meaning.trim()) ||
        (typeof rec.definition === "string" && rec.definition.trim()) ||
        (typeof rec.translation === "string" && rec.translation.trim()) ||
        "";
      const ipa =
        (typeof rec.ipa === "string" && rec.ipa.trim()) ||
        (typeof rec.pronunciation === "string" && rec.pronunciation.trim()) ||
        "";
      entries.push({ word: w, meaning, ...(ipa ? { ipa } : {}) });
    }
  }

  if (entries.length === 0) {
    return { error: "No valid words found — each entry needs a `word` (and optionally a `meaning`)." };
  }

  return { list: { id, name: name || id, source: "custom", words: entries } };
}

export function getCustomLists(): WordList[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is WordList => l !== null && typeof l === "object" && Array.isArray((l as WordList).words)
    );
  } catch {
    return [];
  }
}

export function saveCustomList(list: WordList): void {
  const lists = getCustomLists().filter((l) => l.id !== list.id);
  lists.push(list);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(lists));
}

export function deleteCustomList(id: string): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(getCustomLists().filter((l) => l.id !== id)));
}

async function fetchList(file: string): Promise<WordList> {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}words/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}`);
  const json: unknown = await res.json();
  const { list, error } = normalizeList(json, file.replace(/\.json$/, ""));
  if (!list) throw new Error(error ?? `Invalid list in ${file}`);
  return { ...list, source: "file" };
}

export async function loadFileLists(): Promise<{ lists: WordList[]; failed: string[] }> {
  const failed: string[] = [];
  const results = await Promise.all(
    BUILT_IN_FILES.map(async (file) => {
      try {
        return await fetchList(file);
      } catch {
        failed.push(file);
        return null;
      }
    })
  );
  const lists = results.filter((l): l is WordList => l !== null);
  return { lists: lists.length > 0 ? lists : [FALLBACK], failed };
}
