import { useEffect, useRef, useState } from "react";
import { clearHistory, getHistory } from "../data/history";
import { normalizeList, saveCustomList } from "../data/lists";
import type { HistoryEntry, WordList } from "../types";
import { CloseIcon, DownloadIcon } from "./icons";

interface SettingsModalProps {
  lists: WordList[];
  onClose: () => void;
  onImported: (list: WordList) => void;
  onDeleted: (id: string) => void;
}

const AI_LANG_KEY = "vocabtype:aiLang";

const EXAMPLE = `{
  "name": "My Vocabulary",
  "words": [
    { "word": "apple", "meaning": "a round fruit", "ipa": "/ˈæpəl/" },
    { "word": "sati",  "meaning": "mindfulness" }
  ]
}`;

/** Common translation languages offered as suggestions in the AI section. */
const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Vietnamese",
  "Indonesian",
  "Malay",
  "Thai",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Japanese",
  "Korean",
  "Hindi",
  "Russian",
  "Arabic",
  "Dutch",
  "Swedish",
  "Polish",
  "Turkish",
  "Greek",
  "Pali",
];

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Copy to clipboard with a fallback for insecure contexts (e.g. file://). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Build the prompt users paste into an AI chat to get app-ready JSON. */
function buildAiPrompt(vocab: string, lang: string): string {
  const target = lang.trim();
  const meaningRule = target
    ? `Translate the meaning of every word into ${target}. Keep the meanings short and concise (a few words, not full sentences); use "" when a word has no meaning.`
    : `Keep the meanings short and concise (a few words, not full sentences); use "" when a word has no meaning.`;
  return `You are creating a word list for a typing + vocabulary practice app.

Convert the vocabulary below into JSON. Output ONLY valid JSON — no explanations, no markdown, no code fences.

Use exactly this format:
{
  "name": "My Vocabulary",
  "words": [
    { "word": "apple", "meaning": "a round fruit", "ipa": "/ˈæpəl/" }
  ]
}

Rules:
- One entry per word; Get only one word, don't include to, grammar, or other extra words.
- ${meaningRule}
- Add an "ipa" field (between slashes, e.g. "/ˈæpəl/") with the English pronunciation — mainly for English words. For words in other languages (or when you are not sure), omit "ipa".
- If you are unsure about the list name, use "Imported list".

Vocabulary:
${vocab}`;
}

function downloadList(list: WordList): void {
  const blob = new Blob([JSON.stringify({ name: list.name, words: list.words }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${list.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || list.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsModal({ lists, onClose, onImported, onDeleted }: SettingsModalProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [vocabText, setVocabText] = useState("");
  // Remember the AI translation language across sessions.
  const [lang, setLang] = useState(() => localStorage.getItem(AI_LANG_KEY) ?? "English");
  const [promptMsg, setPromptMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, bumpHistory] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    localStorage.setItem(AI_LANG_KEY, lang);
  }, [lang]);

  const history = getHistory();

  const handleImport = () => {
    setError(null);
    setSuccess(null);
    try {
      const parsed: unknown = JSON.parse(text);
      const { list, error: err } = normalizeList(parsed, `custom-${Date.now()}`);
      if (!list) {
        setError(err ?? "Could not parse this list.");
        return;
      }
      saveCustomList(list);
      setText("");
      setSuccess(`Imported "${list.name}" — ${list.words.length} words.`);
      onImported(list);
    } catch {
      setError("Invalid JSON — check the syntax and try again.");
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setSuccess(null);
    try {
      setText(await f.text());
    } catch {
      setError("Could not read that file.");
    }
    e.target.value = "";
  };

  const handleCopyPrompt = async () => {
    const ok = await copyText(buildAiPrompt(vocabText.trim(), lang));
    setPromptMsg(
      ok
        ? { ok: true, text: "Prompt copied — paste it into your AI chat." }
        : { ok: false, text: "Copy failed — select the prompt below manually." }
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            <CloseIcon />
          </button>
        </div>

        <section>
          <h3>Import a word list</h3>
          <p className="muted">
            Paste JSON below or load a .json file. Imported lists are stored in your browser, so
            there is no need to rebuild or redeploy.
          </p>
          <textarea
            className="import-area"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Paste JSON, e.g. {"name":"My list","words":[{"word":"...","meaning":"..."}]}'
            spellCheck={false}
            aria-label="Word list JSON"
            autoFocus
          />
          <div className="modal-row">
            <button type="button" className="btn" onClick={handleImport}>
              Import
            </button>
            <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()}>
              Load .json file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={handleFile}
            />
          </div>
          {error && <p className="msg err">{error}</p>}
          {success && <p className="msg ok">{success}</p>}
        </section>

        <section>
          <h3>Generate a list with AI</h3>
          <p className="muted">
            Paste your vocabulary below (one per line, e.g. <code>word — meaning</code>), choose the
            language for the meanings, copy the prompt, and paste it into ChatGPT, Claude, Gemini,
            or any AI chat. The AI replies with ready-made JSON — paste that into the import box
            above.
          </p>
          <div className="lang-field">
            <label htmlFor="ai-lang">Translate meanings into</label>
            <input
              id="ai-lang"
              className="lang-input"
              list="lang-suggestions"
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                setPromptMsg(null);
              }}
              spellCheck={false}
              aria-label="Translation language"
            />
            <datalist id="lang-suggestions">
              {LANGUAGES.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <textarea
            className="import-area compact"
            value={vocabText}
            onChange={(e) => {
              setVocabText(e.target.value);
              setPromptMsg(null);
            }}
            placeholder={"word — meaning\nword — meaning\n…"}
            rows={4}
            spellCheck={false}
            aria-label="Your vocabulary"
          />
          <div className="modal-row">
            <button
              type="button"
              className="btn"
              onClick={handleCopyPrompt}
              disabled={!vocabText.trim()}
            >
              Copy AI prompt
            </button>
            {promptMsg && <p className={`msg ${promptMsg.ok ? "ok" : "err"}`}>{promptMsg.text}</p>}
          </div>
          {vocabText.trim() && (
            <pre className="example prompt-preview">{buildAiPrompt(vocabText.trim(), lang)}</pre>
          )}
        </section>

        <section>
          <h3>Format</h3>
          <pre className="example">{EXAMPLE}</pre>
          <p className="muted">
            Plain arrays also work: <code>[{"{ \"word\": \"apple\", \"meaning\": \"a fruit\" }"}]</code>{" "}
            or even <code>["apple", "banana"]</code> (no meanings).
          </p>
        </section>

        <section>
          <h3>Your lists ({lists.length})</h3>
          <div className="list-group">
            {lists.map((l) => (
              <div key={l.id} className="list-row">
                <div>
                  <div className="name">{l.name}</div>
                  <div className="meta">
                    {l.words.length} words · {l.source === "custom" ? "imported" : "bundled"}
                  </div>
                </div>
                <div className="list-actions">
                  {l.source === "custom" && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => downloadList(l)}
                      aria-label={`Export ${l.name}`}
                      title="Export as JSON"
                    >
                      <DownloadIcon size={16} />
                    </button>
                  )}
                  {l.source === "custom" && (
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => onDeleted(l.id)}
                      aria-label={`Delete ${l.name}`}
                    >
                      delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="history-head">
            <h3>Test history ({history.length})</h3>
            {history.length > 0 && (
              <button
                type="button"
                className="btn danger small"
                onClick={() => {
                  clearHistory();
                  bumpHistory((v) => v + 1);
                }}
              >
                clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="muted">No completed tests yet — finish a test and it will appear here.</p>
          ) : (
            <div className="history-group">
              {history.map((h: HistoryEntry, i) => (
                <div key={`${h.date}-${i}`} className="history-row">
                  <span className="history-date">{formatDate(h.date)}</span>
                  <span className="history-name" title={h.listName}>
                    {h.listName}
                  </span>
                  <span className="history-meta">
                    {h.count} words · {h.errors} errors
                  </span>
                  <span className="history-nums">
                    <b>{h.wpm}</b> wpm · <b>{h.acc}%</b>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
