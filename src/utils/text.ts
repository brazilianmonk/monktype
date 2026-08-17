/**
 * Split a string into Unicode code points. Pali words use precomposed
 * diacritics (ā, ṃ, ñ…), so a plain index-based split would miscount.
 */
export function toChars(s: string): string[] {
  return Array.from(s);
}

/**
 * Remove trailing marker characters: `*` (drill this word) and `/` (memorize
 * this word). They are typed as flags, not part of the word.
 */
export function stripTrailingMarkers(s: string): string {
  return s.replace(/[*\/]+$/, "");
}
