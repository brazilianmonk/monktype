import { RestartIcon } from "./icons";

interface LiveStatsProps {
  elapsedMs: number;
  wpm: number;
  acc: number;
  done: number;
  total: number;
  onNewTest: () => void;
}

export function LiveStats({ elapsedMs, wpm, acc, done, total, onNewTest }: LiveStatsProps) {
  const seconds = (elapsedMs / 1000).toFixed(1);
  return (
    <div className="live-stats">
      <div className="stat">
        <span className="label">time</span>
        <span className="value">{seconds}s</span>
      </div>
      <div className="stat">
        <span className="label">wpm</span>
        <span className="value">{wpm}</span>
      </div>
      <div className="stat">
        <span className="label">acc</span>
        <span className="value">{acc}%</span>
      </div>
      <div className="stat">
        <span className="label">words</span>
        <span className="value">
          {done}/{total}
        </span>
      </div>
      <div className="spacer" />
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
