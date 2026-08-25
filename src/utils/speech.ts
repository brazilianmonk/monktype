/**
 * Text-to-speech for pronunciation.
 *
 * Primary: Google Translate's public TTS endpoint
 * (`translate.google.com/translate_tts`). Free, no API key, no backend, and a
 * far more natural voice than typical OS engines. It caps requests at ~200
 * characters, so longer texts ("word. meaning…") are split into chunks and
 * played back-to-back. Played via an <audio> element, so no CORS setup is
 * needed. Note: this is an unofficial endpoint.
 *
 * Fallback: the built-in Web Speech API (window.speechSynthesis), used when
 * the online endpoint fails (offline, blocked by an extension, endpoint
 * unavailable), preferring online "Google"/natural voices when present.
 */

/** Google Translate TTS rejects queries longer than ~200 characters. */
const GTTS_MAX_CHARS = 190;

let audio: HTMLAudioElement | null = null;
let queue: string[] = [];
/** Full text currently being spoken, for the synthesis fallback. */
let currentText = "";
let voices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;

function refreshVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) voicesLoaded = true;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  // Voices load asynchronously on some browsers; keep the cached list fresh.
  window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
}

/** Prefer a clear English voice (online when available), else any voice. */
function pickVoice(): SpeechSynthesisVoice | null {
  if (!voicesLoaded) refreshVoices();
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const preferred = en.find((v) => /google|online|enhanced|natural/i.test(v.name)) ?? en[0];
  return preferred ?? voices[0];
}

/**
 * Speak `text` through the browser's built-in synthesis. Cancels any
 * previous utterance first.
 */
function speakWithSynth(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  }
  utter.rate = 0.95; // slightly slower so it is easy to follow

  if (voices.length === 0) {
    // First call: voices may not be loaded yet; speak once they arrive.
    const onVoices = () => {
      synth.removeEventListener("voiceschanged", onVoices);
      const v = pickVoice();
      if (v) {
        utter.voice = v;
        utter.lang = v.lang;
      }
      synth.speak(utter);
    };
    synth.addEventListener("voiceschanged", onVoices);
  } else {
    synth.speak(utter);
  }
}

/** Split `text` into ≤GTTS_MAX_CHARS pieces, breaking on word boundaries. */
function chunkText(text: string): string[] {
  if (text.length <= GTTS_MAX_CHARS) return [text];
  const chunks: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if (cur && `${cur} ${word}`.length > GTTS_MAX_CHARS) {
      chunks.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function gttsUrl(text: string): string {
  return (
    "https://translate.google.com/translate_tts?" +
    new URLSearchParams({ ie: "UTF-8", client: "tw-ob", tl: "en", q: text })
  );
}

/** Play the next chunk in the queue (or clean up when it runs dry). */
function playNextChunk(): void {
  const url = queue.shift();
  if (!url) {
    audio = null;
    return;
  }
  // Built via createElement so referrerPolicy can be set BEFORE src.
  const el = (audio ?? document.createElement("audio")) as HTMLAudioElement;
  audio = el;
  el.onended = null;
  el.onerror = null;
  // Google rejects translate_tts requests that carry a page Referer with a
  // 404 (it works only when opened directly, i.e. without one). Strip it so
  // the media request looks like direct navigation. (Not yet in the TS DOM
  // typings for media elements — hence the cast; supported in all modern
  // browsers.)
  (el as HTMLAudioElement & { referrerPolicy: string }).referrerPolicy =
    "no-referrer";
  el.src = url;
  el.onended = () => playNextChunk();
  el.onerror = () => {
    // Endpoint unreachable/blocked mid-queue — finish via built-in speech.
    const text = currentText;
    stopSpeaking();
    speakWithSynth(text);
  };
  void el.play().catch(() => {
    // Autoplay rejection or network failure — degrade to built-in speech.
    const text = currentText;
    stopSpeaking();
    speakWithSynth(text);
  });
}

/** Stop any currently playing/spoken text (e.g. when a new word starts). */
export function stopSpeaking(): void {
  queue = [];
  currentText = "";
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (audio) {
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    audio.src = "";
    audio = null;
  }
}

/**
 * Speak `text` aloud via Google Translate TTS, falling back to built-in
 * synthesis when the online stream cannot play. Any ongoing speech is
 * cancelled first, so repeated calls always start fresh. Returns false for
 * empty text.
 */
export function speak(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;

  stopSpeaking();
  currentText = clean;
  queue = chunkText(clean).map(gttsUrl);
  playNextChunk();
  return true;
}
