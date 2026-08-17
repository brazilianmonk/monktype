import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { WordEntry } from "../types";
import { toChars } from "../utils/text";

/** What the meaning bubble should show and where. */
export interface BubbleInfo {
  /** The finished (or current, in peek mode) word. */
  word: string;
  meaning: string;
  /** IPA pronunciation, e.g. "/əˈbɪləti/"; empty when the list has none. */
  ipa: string;
  /** The word index the bubble is anchored to (its "next word"). */
  targetIndex: number;
  visible: boolean;
  /** Remount + pop on each new word (finished-word mode) vs. glide (peek). */
  animate: boolean;
}

interface WordsProps {
  words: WordEntry[];
  typed: string[];
  activeIndex: number;
  bubble?: BubbleInfo | null;
}

const BUBBLE_GAP = 10;

/**
 * A small tooltip anchored above a word in the grid. It is positioned in
 * "area" coordinates (the words-area is not clipped), so it stays visible
 * even when the word grid scrolls inside its viewport.
 */
function MeaningBubble({
  bubble,
  areaRef,
  viewportRef,
  innerRef,
  translateY,
}: {
  bubble: BubbleInfo;
  areaRef: RefObject<HTMLDivElement>;
  viewportRef: RefObject<HTMLDivElement>;
  innerRef: RefObject<HTMLDivElement>;
  translateY: number;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [flipped, setFlipped] = useState(false);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const vp = viewportRef.current;
    const inner = innerRef.current;
    const el = bubbleRef.current;
    const target = area?.querySelector<HTMLElement>(`[data-w="${bubble.targetIndex}"]`);
    if (!area || !vp || !inner || !el || !target) return;

    // Anchor with layout offsets (unaffected by the scroll transform and its
    // CSS transition), then add the final scroll offset. getBoundingClientRect
    // would report a mid-animation value right after a line-wrap scroll, which
    // is why the bubble used to land in the wrong spot on a new row.
    const wordX = vp.offsetLeft + inner.offsetLeft + target.offsetLeft;
    const wordY = vp.offsetTop + inner.offsetTop + target.offsetTop + translateY;
    const wordW = target.offsetWidth;
    const wordH = target.offsetHeight;
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    const areaW = area.offsetWidth;
    const areaH = area.offsetHeight;

    // Prefer the bubble above the word; flip it below when there is no room,
    // then clamp so it always stays inside the words area (and on screen)
    // without ever covering the word it describes.
    let top = wordY - bh - BUBBLE_GAP;
    const below = top < BUBBLE_GAP;
    if (below) top = wordY + wordH + BUBBLE_GAP;
    top = Math.max(BUBBLE_GAP, Math.min(top, areaH - bh - BUBBLE_GAP));

    let left = wordX + wordW / 2;
    const half = bw / 2;
    left = Math.max(half + BUBBLE_GAP, Math.min(left, areaW - half - BUBBLE_GAP));

    setFlipped(below);
    setPos({ left, top });
  }, [bubble.targetIndex, bubble.word, bubble.visible, translateY, areaRef, viewportRef, innerRef]);

  return (
    <div
      ref={bubbleRef}
      key={bubble.animate ? bubble.word : undefined}
      className={`meaning-bubble${bubble.visible ? " visible" : ""}${flipped ? " flipped" : ""}`}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
    >
      <span className="mb-word">{bubble.word}</span>
      {bubble.ipa && <span className="mb-ipa">{bubble.ipa}</span>}
      <span className="mb-dash">—</span>
      <span className="mb-meaning">{bubble.meaning || "no meaning"}</span>
    </div>
  );
}

/**
 * Renders the words in a wrapping grid:
 *  - typed words show correct/incorrect letters and a red underline on error
 *  - the active word is followed by a blinking caret
 *  - the grid scrolls inside a clipped viewport so the active word stays visible
 *  - an optional meaning bubble floats above a target word (the "next word")
 */
export function Words({ words, typed, activeIndex, bubble }: WordsProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [translateY, setTranslateY] = useState(0);
  const [caretX, setCaretX] = useState(0);

  const activeChars = toChars(words[activeIndex]?.word ?? "");
  const activeTyped = typed[activeIndex] ?? "";
  const caretChar = Math.min(activeTyped.length, activeChars.length);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const inner = innerRef.current;
    if (!viewport || !inner) return;
    const wordEl = inner.querySelector<HTMLElement>(`[data-w="${activeIndex}"]`);
    if (!wordEl) return;
    const activeChars = toChars(words[activeIndex]?.word ?? "");

    // Where the active word sits relative to the untransformed content top.
    const vr = viewport.getBoundingClientRect();
    const ir = inner.getBoundingClientRect();
    const relTop = wordEl.getBoundingClientRect().top - ir.top;

    // One text line = the word's outer box (line-height + border + margins).
    const cs = getComputedStyle(wordEl);
    const marginTop = parseFloat(cs.marginTop);
    const lineHeight = wordEl.offsetHeight + marginTop + parseFloat(cs.marginBottom);
    const lineTop = relTop - marginTop;

    // Keep the active word's line on the middle row of the viewport,
    // scrolling by a line whenever the active word wraps to the next line.
    // Never scroll past the top or bottom of the content.
    let t = lineHeight - lineTop;
    t = Math.min(0, Math.max(t, vr.height - inner.offsetHeight));
    setTranslateY(t);

    // Position the caret inside the active word. offsetLeft is a layout
    // offset (unaffected by the container transform), so it stays correct.
    const letterIdx = Math.min(caretChar, Math.max(0, activeChars.length - 1));
    const letterEl = inner.querySelector<HTMLElement>(`[data-l="${activeIndex}:${letterIdx}"]`);
    if (letterEl) {
      const atEnd = caretChar >= activeChars.length;
      setCaretX(letterEl.offsetLeft + (atEnd ? letterEl.offsetWidth : 0));
    }
  }, [activeIndex, caretChar, words]);

  if (words.length === 0) return null;

  return (
    <div className="words-area" ref={areaRef}>
      <div className="words-viewport" ref={viewportRef}>
        <div className="words" ref={innerRef} style={{ transform: `translateY(${translateY}px)` }}>
          {words.map((entry, i) => {
            const chars = toChars(entry.word);
            const t = typed[i] ?? "";
            const tChars = toChars(t);
            const isActive = i === activeIndex;
            const isDone = i < activeIndex;
            let hasError = false;

            const letters = chars.map((c, j) => {
              let cls = "";
              if (isDone) {
                if (j < tChars.length) {
                  if (tChars[j] === c) cls = "correct";
                  else {
                    cls = "incorrect";
                    hasError = true;
                  }
                } else {
                  cls = "missing";
                  hasError = true;
                }
              } else if (isActive && j < tChars.length) {
                if (tChars[j] === c) cls = "correct";
                else {
                  cls = "incorrect";
                  hasError = true;
                }
              }
              return (
                <span key={j} data-l={`${i}:${j}`} className={`letter ${cls}`.trim()}>
                  {c}
                </span>
              );
            });

            // Extra letters typed beyond the end of the word. A trailing `*`
            // (drill now) or `/` (memorize later) is a marker, so it is shown
            // in its own color rather than counted as a typo.
            for (let j = chars.length; j < tChars.length; j++) {
              const last = j === tChars.length - 1;
              if (last && (tChars[j] === "*" || tChars[j] === "/")) {
                letters.push(
                  <span
                    key={`x${j}`}
                    data-l={`${i}:${j}`}
                    className={`letter ${tChars[j] === "*" ? "star" : "slash"}`}
                  >
                    {tChars[j]}
                  </span>
                );
                continue;
              }
              hasError = true;
              letters.push(
                <span key={`x${j}`} data-l={`${i}:${j}`} className="letter incorrect extra">
                  {tChars[j]}
                </span>
              );
            }

            return (
              <div
                key={i}
                data-w={i}
                className={`word${isActive ? " active" : ""}${hasError ? " error" : ""}`}
              >
                {entry.repeat && (
                  <span className="repeat-badge" aria-hidden="true" title="difficult word — being drilled">
                    ★
                  </span>
                )}
                {entry.memorize && (
                  <span className="memorize-badge" aria-hidden="true" title="memorize word — recurs in later tests">
                    ↻
                  </span>
                )}
                {isActive && (
                  <span className="caret" style={{ left: `${caretX}px` }} aria-hidden="true" />
                )}
                {letters}
              </div>
            );
          })}
        </div>
      </div>
      {bubble && (
        <MeaningBubble
          bubble={bubble}
          areaRef={areaRef}
          viewportRef={viewportRef}
          innerRef={innerRef}
          translateY={translateY}
        />
      )}
    </div>
  );
}
