import type { Completion } from "../types";

/** Net WPM: a "word" is 5 characters. */
export function netWpm(correctChars: number, ms: number): number {
  if (ms <= 0) return 0;
  return Math.round(correctChars / 5 / (ms / 60000));
}

/** Raw WPM counts every typed character, including mistakes. */
export function rawWpm(typedChars: number, ms: number): number {
  if (ms <= 0) return 0;
  return Math.round(typedChars / 5 / (ms / 60000));
}

export function accuracy(correctChars: number, typedChars: number): number {
  if (typedChars === 0) return 100;
  return Math.round((correctChars / typedChars) * 100);
}

/** Average WPM per second, for the results chart. */
export function wpmHistory(completions: Completion[], totalMs: number): number[] {
  const seconds = Math.max(1, Math.ceil(totalMs / 1000));
  const buckets: { sum: number; n: number }[] = Array.from({ length: seconds }, () => ({
    sum: 0,
    n: 0,
  }));
  for (const c of completions) {
    const idx = Math.min(seconds - 1, Math.floor(c.t / 1000));
    buckets[idx].sum += c.wpm;
    buckets[idx].n += 1;
  }
  return buckets.map((b) => (b.n > 0 ? Math.round(b.sum / b.n) : 0));
}
