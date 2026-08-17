import type { WordOrder } from "../hooks/useTypingTest";
import type { WordList } from "../types";
import { EyeIcon, EyeOffIcon, RestartIcon } from "./icons";

export const WORD_COUNTS = [10, 25, 50, 100, 250, 500];

interface ConfigBarProps {
  count: number;
  onCount: (n: number) => void;
  lists: WordList[];
  listId: string;
  onList: (id: string) => void;
  peek: boolean;
  onTogglePeek: () => void;
  /** How words are picked: random subset or in order (continuing last time). */
  order: WordOrder;
  onOrder: (o: WordOrder) => void;
  /** Active practice mode (retyping mistakes) with a way to exit. */
  practice?: { label: string; onExit: () => void };
  onNewTest: () => void;
}

export function ConfigBar({
  count,
  onCount,
  lists,
  listId,
  onList,
  peek,
  onTogglePeek,
  order,
  onOrder,
  practice,
  onNewTest,
}: ConfigBarProps) {
  return (
    <div className="config">
      <div className="group" role="group" aria-label="Number of words per test">
        {WORD_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            className={`opt${n === count ? " active" : ""}`}
            onClick={() => onCount(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="group" role="group" aria-label="Word list">
        <select value={listId} onChange={(e) => onList(e.target.value)} aria-label="Word list">
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.words.length})
            </option>
          ))}
        </select>
      </div>
      <div className="group" role="group" aria-label="Word selection order">
        <button
          type="button"
          className={`opt${order === "random" ? " active" : ""}`}
          onClick={() => onOrder("random")}
          aria-pressed={order === "random"}
          title="Random subset of words each test"
        >
          random
        </button>
        <button
          type="button"
          className={`opt${order === "sequence" ? " active" : ""}`}
          onClick={() => onOrder("sequence")}
          aria-pressed={order === "sequence"}
          title="Go through the list in order; the next test continues where you left off"
        >
          in order
        </button>
      </div>
      {practice && (
        <span className="practice-badge">
          {practice.label}
          <button type="button" onClick={practice.onExit} aria-label="Exit practice mode">
            ×
          </button>
        </span>
      )}
      <div className="spacer" />
      <button
        type="button"
        className={`icon-btn peek-btn${peek ? " active" : ""}`}
        onClick={onTogglePeek}
        aria-label={peek ? "Hide meaning while typing" : "Show meaning while typing"}
        aria-pressed={peek}
        title={peek ? "Meaning shown while typing — click to hide" : "Show meaning while typing"}
      >
        {peek ? <EyeIcon /> : <EyeOffIcon />}
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onNewTest}
        aria-label="New test"
        title="New test"
      >
        <RestartIcon />
      </button>
    </div>
  );
}
