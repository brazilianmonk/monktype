/**
 * Text-to-speech for the speaker buttons.
 *
 * Primary: the built-in Web Speech API (window.speechSynthesis). On Chrome
 * the "Google" voices are cloud/online voices, so the audio comes from
 * Google's servers without any API key or network setup; on other browsers
 * it falls back to the best locally available English voice.
 *
 * Fallback (online API): when speech synthesis is unavailable, an `<audio>`
 * element plays the word from Google Translate's public TTS endpoint
 * (`translate.google.com/translate_tts`). It needs no API key; note it is an
 * unofficial endpoint, so it is only used as a last resort.
 */

let voices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;
let onlineAudio: HTMLAudioElement | null = null;

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
 * Speak `text` through the Google Translate TTS endpoint, played with an
 * `<audio>` element. Cancels any previous online utterance.
 */
function speakOnline(text: string): void {
  if (onlineAudio) {
    onlineAudio.pause();
    onlineAudio.src = "";
    onlineAudio = null;
  }
  const url =
    "https://translate.google.com/translate_tts?" +
    new URLSearchParams({ ie: "UTF-8", client: "tw-ob", tl: "en", q: text });
  const audio = new Audio(url);
  onlineAudio = audio;
  void audio.play().catch(() => {
    // Ignore autoplay/network failures — the button simply does nothing then.
  });
}

/**
 * Speak `text` aloud. Any ongoing utterance is cancelled first, so clicking a
 * speaker repeatedly always starts fresh. Returns false when neither speech
 * synthesis nor the online fallback is available. On the first call voices may
 * not be loaded yet; in that case the word is spoken as soon as they arrive.
 */
export function speak(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    speakOnline(clean);
    return true;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice();
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  }
  utter.rate = 0.95; // slightly slower so it is easy to follow

  if (voices.length === 0) {
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
  return true;
}

/** Stop any currently spoken text (e.g. when a new test starts). */
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (onlineAudio) {
    onlineAudio.pause();
    onlineAudio.src = "";
    onlineAudio = null;
  }
}
