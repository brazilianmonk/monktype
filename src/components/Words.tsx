import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { WordEntry } from "../types";
import { toChars } from "../utils/text";
import { speak } from "../utils/speech";

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
 * A small speaker icon SVG for the bubble's pronunciation button.
 */
function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

/**
 * A floating meaning bubble anchored above (or below) a word in the grid.
 * Positioned in area-relative coordinates, clamped to the viewport so it
 * never covers the target word and never extends off-screen.
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
  const [pos, setPos] = useState<{ left: number; top: number; arrowPct: number } | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [resizeTick, setResizeTick] = useState(0);

  // Re-layout on window resize so the bubble stays on screen.
  useEffect(() => {
    const onResize = () => setResizeTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const vp = viewportRef.current;
    const inner = innerRef.current;
    const el = bubbleRef.current;
    const target = area?.querySelector<HTMLElement>(`[data-w="${bubble.targetIndex}"]`);
    if (!area || !vp || !inner || !el || !target) return;

    // Word position in area-relative coordinates (layout offsets are
    // unaffected by the scrolling CSS transform).
    const wordX = vp.offsetLeft + inner.offsetLeft + target.offsetLeft;
    const wordY = vp.offsetTop + inner.offsetTop + target.offsetTop + translateY;
    const wordW = target.offsetWidth;
    const wordH = target.offsetHeight;
    const bw = el.offsetWidth;
    const areaW = area.offsetWidth;
    const areaRect = area.getBoundingClientRect();
    const wordVpTop = areaRect.top + wordY;
    const wordVpBottom = wordVpTop + wordH;

    // Vertical padding/borders of the outer bubble, and the bubble's natural
    // (uncapped) height. scrollHeight of the inner wrapper reports the full
    // content height even when a max-height clip is applied, so the height
    // we measure here is stable regardless of the current cap — this keeps
    // the layout decision from oscillating.
    const cs = getComputedStyle(el);
    const padV =
      parseFloat(cs.paddingTop) +
      parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) +
      parseFloat(cs.borderBottomWidth);
    const innerScroll = el.querySelector<HTMLElement>(".mb-scroll");
    const naturalContentH = innerScroll
      ? innerScroll.scrollHeight
      : Math.max(0, el.offsetHeight - padV);
    const bh = naturalContentH + padV;

    const VIEWPORT_MARGIN = 8;
    const vpTop = VIEWPORT_MARGIN;
    const vpBottom = window.innerHeight - VIEWPORT_MARGIN;

    // Decide placement: above the word (preferred), else below, else cap
    // height on the roomier side.  The bubble *never* overlaps the target
    // word — the gap is always maintained.
    const aboveTop = wordVpTop - bh - BUBBLE_GAP;
    const fitsAbove = aboveTop >= vpTop;
    const belowTop = wordVpBottom + BUBBLE_GAP;
    const fitsBelow = belowTop + bh <= vpBottom;

    let placement: "above" | "below";
    let maxInnerH: number | null = null;
    if (fitsAbove) {
      placement = "above";
    } else if (fitsBelow) {
      placement = "below";
    } else {
      // Neither fits — cap the scrollable inner area on the roomier side.
      const roomAbove = wordVpTop - vpTop - BUBBLE_GAP;
      const roomBelow = vpBottom - wordVpBottom - BUBBLE_GAP;
      if (roomBelow > roomAbove) {
        placement = "below";
        maxInnerH = Math.max(0, roomBelow - padV);
      } else {
        placement = "above";
        maxInnerH = Math.max(0, roomAbove - padV);
      }
    }

    const renderedBh = maxInnerH == null ? bh : Math.min(bh, maxInnerH + padV);
    const top =
      placement === "above"
        ? wordY - renderedBh - BUBBLE_GAP
        : wordY + wordH + BUBBLE_GAP;

    // Horizontal: centre on the word, then clamp to viewport and area.
    let left = wordX + wordW / 2;
    const half = bw / 2;
    // When the word sits near the right edge, don't squeeze the bubble
    // between the word and the screen border — align the bubble's RIGHT edge
    // with the word's right edge so the box extends to the LEFT and the
    // meaning keeps its full width (no extra wrapping).
    const maxCenter = areaW - half - BUBBLE_GAP;
    if (left > maxCenter) {
      left = Math.min(left, wordX + wordW - half);
    }
    const vpLeft = areaRect.left + left - half;
    const vpRight = areaRect.left + left + half;
    if (vpLeft < VIEWPORT_MARGIN) left += VIEWPORT_MARGIN - vpLeft;
    if (vpRight > window.innerWidth - VIEWPORT_MARGIN) left -= vpRight - (window.innerWidth - VIEWPORT_MARGIN);
    left = Math.max(half + BUBBLE_GAP, Math.min(left, areaW - half - BUBBLE_GAP));

    // Slide the arrow/tail along the bubble's edge so it keeps pointing at
    // the target word even after the bubble was shifted or clamped.
    const wordCenterX = wordX + wordW / 2;
    const arrowX = Math.min(Math.max(wordCenterX, left - half + 14), left + half - 14);
    const arrowPct = ((arrowX - (left - half)) / bw) * 100;

    setFlipped(placement === "below");
    setCap(maxInnerH);
    setPos({ left, top, arrowPct });
    // eslint-disable-next-line no-console
    console.log("[bubble-debug]", JSON.stringify({
      word: bubble.word, target: bubble.targetIndex, translateY,
      wordY, wordVpTop, bh, bw, fitsAbove, fitsBelow, placement,
      maxInnerH, renderedBh, top, left,
      wordOffsetTop: target.offsetTop, vpOffsetTop: vp.offsetTop, innerOffsetTop: inner.offsetTop,
      areaRectTop: areaRect.top, areaRectLeft: areaRect.left, areaW, viewportH: window.innerHeight,
    }));
  }, [
    bubble.targetIndex,
    bubble.word,
    bubble.meaning,
    bubble.ipa,
    bubble.visible,
    translateY,
    resizeTick,
    areaRef,
    viewportRef,
    innerRef,
  ]);

  return (
    <div
      ref={bubbleRef}
      key={bubble.animate ? bubble.word : undefined}
      className={`meaning-bubble${bubble.visible ? " visible" : ""}${flipped ? " flipped" : ""}`}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, "--mb-arrow-x": `${pos?.arrowPct ?? 50}%` } as CSSProperties}
    >
      <div className="mb-scroll" style={cap != null ? { maxHeight: cap } : undefined}>
        <span className="mb-word">{bubble.word}</span>
        <button
          type="button"
          className="speaker-btn"
          title={`Pronounce ${bubble.word}`}
          aria-label={`Pronounce ${bubble.word}`}
          onClick={() => {
            // The click bubbles up to the typing-area, which refocuses the
            // typing input so the user can keep typing.
            speak(bubble.word);
          }}
        >
          <SpeakerIcon />
        </button>
        {bubble.ipa && <span className="mb-ipa">{bubble.ipa}</span>}
        <span className="mb-dash">—</span>
        <span className="mb-meaning">{bubble.meaning || "no meaning"}</span>
      </div>
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
  // Position/size of the underline caret, in px relative to the active word.
  const [caretPos, setCaretPos] = useState<{ x: number; y: number; w: number } | null>(null);

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

    // Position the underline caret under the current letter. offsetLeft/Top
    // are layout offsets (unaffected by the container transform), so they
    // stay correct. When the word is fully typed, the caret moves just past
    // the last letter (the insertion point before the spacebar).
    const letterIdx = Math.min(caretChar, Math.max(0, activeChars.length - 1));
    const letterEl = inner.querySelector<HTMLElement>(`[data-l="${activeIndex}:${letterIdx}"]`);
    if (letterEl) {
      const atEnd = caretChar >= activeChars.length;
      setCaretPos({
        x: letterEl.offsetLeft + (atEnd ? letterEl.offsetWidth : 0),
        y: letterEl.offsetTop + letterEl.offsetHeight,
        w: letterEl.offsetWidth,
      });
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
                  {/* A space inside an inline-block box collapses to zero width;
                      render it as a non-breaking space so phrases ("to get") keep
                      their gap and the caret tracks the right box. */}
                  {c === " " ? "\u00A0" : c}
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
                  {tChars[j] === " " ? "\u00A0" : tChars[j]}
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
                {isActive && caretPos && (
                  <span
                    className="caret"
                    style={{
                      left: `${caretPos.x}px`,
                      top: `${caretPos.y}px`,
                      width: `${caretPos.w}px`,
                    }}
                    aria-hidden="true"
                  />
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
