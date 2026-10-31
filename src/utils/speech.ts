import { createSignal } from 'solid-js';
import clips from '../data/syllable-clips.json';
import cmnClips from '../data/syllable-clips-cmn.json';
import { characterStore } from '../stores/characterStore';
import { pinyinParts, syllableKey } from './pinyin';

const CLIP = new Set(clips);
const CMN = new Set(cmnClips);

type Speaker = 'f' | 'm' | 'c';

/** 1 woman, 2 man, 3 Chen Wang. Each listen click advances, whichever character it is. */
const ORDER: Speaker[] = ['f', 'm', 'c'];
const VOICE_KEY = 'hsk-voice-index';

const readVoiceIndex = (): number => {
  try {
    const n = Number(sessionStorage.getItem(VOICE_KEY));
    return Number.isInteger(n) && n >= 0 ? n % ORDER.length : 0;
  } catch {
    return 0;
  }
};

let nextVoice = readVoiceIndex();

const VOICE_NAME = ['Mujer, Taiwán', 'Hombre, Taiwán', 'Chen Wang'] as const;
const [voiceLabel, setVoiceLabel] = createSignal(VOICE_NAME[readVoiceIndex()]);
/** Who is speaking, or who the next listen click will play once the audio has ended. */
export const currentVoiceLabel = voiceLabel;

/** A listen clip is still playing. Another listen click moves on instead of repeating it. */
let active = false;

const rememberVoice = (index: number) => {
  nextVoice = index % ORDER.length;
  setVoiceLabel(VOICE_NAME[nextVoice]);
  try {
    sessionStorage.setItem(VOICE_KEY, String(nextVoice));
  } catch {
    // Private mode can block storage. The in-memory index still advances.
  }
};

/** Chen Wang's set is smaller. A missing syllable uses the woman's clip. */
const fileVoice = (voice: Speaker, key: string): Speaker =>
  voice === 'c' && !CMN.has(key) ? 'f' : voice;

let playId = 0;
let current: HTMLAudioElement | null = null;
let citations: Map<string, string> | null = null;

const citationKey = (hanzi: string): string | null => {
  if (!citations) {
    citations = new Map();
    for (const row of characterStore.state.characters) {
      const first = row.pinyin.split(/[\s,;/]+/).find(Boolean);
      const key = first ? syllableKey(first) : null;
      if (key) citations.set(row.character, key);
    }
  }
  return citations.get(hanzi) ?? null;
};

const resolveKey = (syllable: string, hanzi?: string): string | null => {
  const key = syllableKey(syllable);
  if (key && CLIP.has(key)) return key;
  if (!hanzi) return null;
  const cited = citationKey(hanzi);
  return cited && CLIP.has(cited) ? cited : null;
};

export const canSpeak = (): boolean => typeof Audio !== 'undefined';

const tts = (text: string, done?: () => void): void => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
    done?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.85;
  const voices = synth.getVoices();
  const voice =
    voices.find((item) => item.lang === 'zh-CN') ?? voices.find((item) => item.lang.startsWith('zh'));
  if (voice) utterance.voice = voice;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    done?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  synth.speak(utterance);
};

/**
 * Play the pinyin. A listen click keeps the speaker's name while that clip
 * plays. When it ends, the button names the next voice, so the following
 * click is a different speaker. Pass `cycle` false for playback that is not
 * a listen click: only the woman, and the button stays put.
 * `hanzi` lines syllables up with characters, so a neutral tone that has no
 * clip can use that character's citation tone. If a clip is missing, fall
 * back to the browser voice.
 */
export const speak = (pinyin: string, hanzi?: string, cycle = true): void => {
  const id = ++playId;
  current?.pause();
  current = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();

  // Cutting a listen clip off with other playback does not spend that voice.
  if (!cycle) active = false;

  const parts = pinyinParts(pinyin);
  const chars = [...(hanzi ?? '')];
  const align = chars.length === parts.length && chars.length > 0;
  const keys = parts.map((part, index) => resolveKey(part.syllable, align ? chars[index] : undefined));

  // The name stays on whoever is audible. It moves on when that clip ends.
  const speaker = (() => {
    if (!cycle) return null;
    if (active) rememberVoice(nextVoice + 1);
    const index = nextVoice % ORDER.length;
    active = true;
    setVoiceLabel(VOICE_NAME[index]);
    return index;
  })();

  let settled = false;
  const finish = (token: number) => {
    if (settled || speaker === null || token !== playId) return;
    settled = true;
    active = false;
    rememberVoice(speaker + 1);
  };

  if (!canSpeak() || keys.length === 0 || keys.some((key) => !key)) {
    tts(hanzi || pinyin, () => finish(id));
    return;
  }

  const ready = keys.filter((key): key is string => key !== null);
  const voice: Speaker = speaker === null ? 'f' : ORDER[speaker];

  const playSyllables = (voice: Speaker, index: number, done: () => void) => {
    if (id !== playId) return;
    if (index >= ready.length) {
      done();
      return;
    }
    const audio = new Audio(`/audio/${fileVoice(voice, ready[index])}/${ready[index]}.mp3`);
    current = audio;
    audio.onended = () => {
      const next = index + 1;
      if (id !== playId) return;
      if (next >= ready.length) {
        done();
        return;
      }
      window.setTimeout(() => playSyllables(voice, next, done), parts[next].gap);
    };
    const giveUp = () => {
      if (id !== playId) return;
      const fallbackId = ++playId;
      tts(hanzi || pinyin, () => finish(fallbackId));
    };
    audio.onerror = giveUp;
    void audio.play().catch(giveUp);
  };

  playSyllables(voice, 0, () => finish(id));
};
