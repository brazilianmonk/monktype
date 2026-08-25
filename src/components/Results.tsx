import { useEffect, useState } from "react";
import type { Completion } from "../types";
import { accuracy, netWpm, rawWpm, wpmHistory } from "../utils/stats";
import { toChars } from "../utils/text";

interface ResultsProps {
  completions: Completion[];
  correctChars: number;
  errorChars: number;
  extraChars: number;
  elapsedMs: number;
  totalWords: number;
  listName: string;
  onRestart: () => void;
  onNewTest: () => void;
  onPracticeMistakes: () => void;
}

function ReviewWord({ completion }: { completion: Completion }) {
  const chars = toChars(completion.entry.word);
  const tChars = toChars(completion.typed);
  return (
    <>
      {chars.map((c, j) => (
        <span key={j} className={j < tChars.length && tChars[j] === c ? "correct" : "incorrect"}>
          {c === " " ? "\u00A0" : c}
        </span>
      ))}
      {tChars.slice(chars.length).map((c, j) => (
        <span key={`x${j}`} className="incorrect extra">
          {c === " " ? "\u00A0" : c}
        </span>
      ))}
    </>
  );
}

export function Results({
  completions,
  correctChars,
  errorChars,
  extraChars,
  elapsedMs,
  totalWords,
  listName,
  onRestart,
  onNewTest,
  onPracticeMistakes,
}: ResultsProps) {
  const typedChars = correctChars + errorChars + extraChars;
  const wpm = netWpm(correctChars, elapsedMs);
  const raw = rawWpm(typedChars, elapsedMs);
  const acc = accuracy(correctChars, typedChars);
  const history = wpmHistory(completions, elapsedMs);
  const maxWpm = Math.max(...history, 1);
  const mistakes = completions.filter((c) => c.errors > 0);
  const [reviewTab, setReviewTab] = useState<"words" | "mistakes">(
    mistakes.length > 0 ? "mistakes" : "words"
  );
  const seconds = (elapsedMs / 1000).toFixed(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        onRestart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRestart]);

  const shown = reviewTab === "mistakes" ? mistakes : completions;

  return (
    <div className="results">
      <div className="big-stats">
        <div className="group">
          <span className="top">wpm</span>
          <span className="bottom">{wpm}</span>
        </div>
        <div className="group">
          <span className="top">acc</span>
          <span className="bottom">{acc}%</span>
        </div>
      </div>

      <div className="morestats">
        <div className="group">
          <span className="top">raw</span>
          <span className="bottom">{raw}</span>
        </div>
        <div className="group">
          <span className="top">characters</span>
          <span className="bottom">
            {correctChars}/{errorChars}/{extraChars}
          </span>
        </div>
        <div className="group">
          <span className="top">time</span>
          <span className="bottom">{seconds}s</span>
        </div>
        <div className="group">
          <span className="top">words</span>
          <span className="bottom">{totalWords}</span>
        </div>
        <div className="group">
          <span className="top">list</span>
          <span className="bottom">{listName}</span>
        </div>
      </div>

      {history.length > 1 && (
        <div className="chart-wrap">
          <span className="title">wpm per second</span>
          <div className="chart" role="img" aria-label="WPM per second chart">
            {history.map((w, i) => (
              <div
                key={i}
                className="bar"
                style={{ height: `${Math.max(2, (w / maxWpm) * 100)}%` }}
                title={`${i + 1}s — ${w} wpm`}
              />
            ))}
          </div>
        </div>
      )}

      {mistakes.length > 0 && (
        <div className="actions">
          <button type="button" className="btn" onClick={onPracticeMistakes}>
            practice mistakes ({mistakes.length})
          </button>
        </div>
      )}

      <div className="review">
        <div className="review-tabs" role="tablist" aria-label="Word review">
          <button
            type="button"
            role="tab"
            id="review-tab-words"
            aria-selected={reviewTab === "words"}
            aria-controls="review-panel"
            className={`review-tab${reviewTab === "words" ? " active" : ""}`}
            onClick={() => setReviewTab("words")}
          >
            words ({completions.length})
          </button>
          <button
            type="button"
            role="tab"
            id="review-tab-mistakes"
            aria-selected={reviewTab === "mistakes"}
            aria-controls="review-panel"
            className={`review-tab${reviewTab === "mistakes" ? " active" : ""}`}
            onClick={() => setReviewTab("mistakes")}
          >
            mistakes ({mistakes.length})
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="muted">No mistakes — great job!</p>
        ) : (
          <div
            className="review-list"
            id="review-panel"
            role="tabpanel"
            aria-labelledby={`review-tab-${reviewTab}`}
          >
            {shown.map((m, i) => (
              <div key={i} className="review-row">
                <span className="result-word">
                  <ReviewWord completion={m} />
                </span>
                {m.entry.ipa && <span className="review-ipa">{m.entry.ipa}</span>}
                <span className="meaning">{m.entry.meaning || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="actions">
        <button type="button" className="text-btn" onClick={onRestart} title="Press tab to restart">
          restart
        </button>
        <button type="button" className="text-btn" onClick={onNewTest} title="Pick new random words">
          new test
        </button>
      </div>
    </div>
  );
}
