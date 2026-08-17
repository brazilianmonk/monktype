import type { HistoryEntry } from "../types";

const HISTORY_KEY = "vocabtype:history";
const MAX_ENTRIES = 50;

export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry => e !== null && typeof e === "object" && typeof (e as HistoryEntry).wpm === "number"
    );
  } catch {
    return [];
  }
}

export function addHistory(entry: HistoryEntry): void {
  const list = [entry, ...getHistory()].slice(0, MAX_ENTRIES);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
