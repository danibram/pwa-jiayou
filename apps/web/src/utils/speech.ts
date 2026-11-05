import { createSignal } from 'solid-js';
import { characterLevel } from '../data/catalog';
import clips from '../data/syllable-clips.json';
import cmnClips from '../data/syllable-clips-cmn.json';
import { characterStore } from '../stores/characterStore';
import { packHasClip, packMediaRoot } from './levelPacks';
import { pinyinParts, syllableKey } from './pinyin';
import { KEYS } from '../persistence/keys';
import { storage } from '../persistence/keyValue';

const CLIP = new Set(clips);
const CMN = new Set(cmnClips);

type Speaker = 'f' | 'm' | 'c';
type TtsGender = 'f' | 'm';

/** Three listen modes: one mainland clip, Taiwan clips that alternate, or device TTS. */
export type VoiceMode = 'mainland' | 'taiwan' | 'tts';

/** Before Chen Wang led, the index pointed into woman, man, Chen Wang. */
const LEGACY_INDEX_KEY = 'hsk-voice-index';
const LEGACY_ORDER: Speaker[] = ['f', 'm', 'c'];

const isSpeaker = (value: unknown): value is Speaker => value === 'f' || value === 'm' || value === 'c';
const isMode = (value: unknown): value is VoiceMode =>
  value === 'mainland' || value === 'taiwan' || value === 'tts';

const speakerToMode = (speaker: Speaker): VoiceMode => (speaker === 'c' ? 'mainland' : 'taiwan');

const MODE_LABEL: Record<VoiceMode, string> = {
  mainland: 'China continental',
  taiwan: 'Taiwán',
  tts: 'TTS',
};

export interface VoiceOption {
  id: VoiceMode;
  /** Button behaviour on each tap, shown under the region. */
  name: string;
  /** Where the sound comes from, the picker's main label. */
  region: string;
}

export const voices: VoiceOption[] = [
  { id: 'mainland', name: '(solo 1 voz)', region: 'China continental' },
  { id: 'taiwan', name: '(mujer, hombre)', region: 'Taiwán' },
  { id: 'tts', name: '(hombre, mujer)', region: 'TTS' },
];

/** The choice lives in localStorage. Older builds kept a speaker per tab. */
const readMode = (): VoiceMode => {
  try {
    const stored = storage.read(KEYS.voiceMode);
    if (isMode(stored)) return stored;
  } catch {
    // Fall through.
  }
  try {
    const stored = storage.read(KEYS.legacyVoice) ?? sessionStorage.getItem(KEYS.legacyVoice);
    if (isSpeaker(stored)) return speakerToMode(stored);
    const legacy = sessionStorage.getItem(LEGACY_INDEX_KEY);
    const n = Number(legacy);
    if (legacy !== null && Number.isInteger(n) && n >= 0) {
      return speakerToMode(LEGACY_ORDER[n % LEGACY_ORDER.length]);
    }
  } catch {
    // Private mode can block storage.
  }
  return 'mainland';
};

const [mode, setModeSignal] = createSignal<VoiceMode>(readMode());
export const currentVoiceMode = mode;
/** @deprecated Prefer currentVoiceMode; kept for call sites that only need the signal. */
export const currentVoice = mode;
export const currentVoiceLabel = (): string => MODE_LABEL[mode()];

export const setVoiceMode = (next: VoiceMode): void => {
  setModeSignal(next);
  turn = 0;
  try {
    storage.write(KEYS.voiceMode, next);
    storage.remove(KEYS.legacyVoice);
    sessionStorage.removeItem(KEYS.legacyVoice);
    sessionStorage.removeItem(LEGACY_INDEX_KEY);
  } catch {
    // The choice still holds for this visit.
  }
};

/** @deprecated Prefer setVoiceMode. */
export const setVoice = setVoiceMode;

/** What is playing, as `pinyin|hanzi`, or null. Buttons compare against their own key. */
const [speakingKey, setSpeakingKey] = createSignal<string | null>(null);
export const speechKey = (pinyin: string, hanzi?: string): string => `${pinyin}|${hanzi ?? ''}`;
export const isSpeaking = (pinyin: string, hanzi?: string): boolean => speakingKey() === speechKey(pinyin, hanzi);
export const speaking = speakingKey;

/** Chen Wang's set is smaller. A missing syllable uses the woman's clip, one syllable at a time. */
const fileVoice = (voice: Speaker, key: string): Speaker =>
  voice === 'c' && !CMN.has(key) ? 'f' : voice;

let playId = 0;
let current: HTMLAudioElement | null = null;
let citations = new Map<string, string>();
let citedRevision = -1;

const citationKey = (hanzi: string): string | null => {
  if (citedRevision !== characterStore.listRevision) {
    citedRevision = characterStore.listRevision;
    citations = new Map();
    for (const row of characterStore.state.characters) {
      const first = row.pinyin.split(/[\s,;/]+/).find(Boolean);
      const key = first ? syllableKey(first) : null;
      if (key) citations.set(row.character, key);
    }
  }
  return citations.get(hanzi) ?? null;
};

const resolveKey = (syllable: string, hanzi?: string, exact = false): string | null => {
  const key = syllableKey(syllable);
  if (!key) return null;
  const level = hanzi ? characterLevel(hanzi) : undefined;
  if (CLIP.has(key)) return key;
  if (level && level > 1 && packHasClip(level, key)) return key;
  if (!hanzi || exact) return null;
  // CNS only ships a closed set of neutrals. Use the character's citation
  // clip when the HSK neutral is missing (谢谢 → xie4, 朋友 → you3).
  const cited = citationKey(hanzi);
  if (cited && CLIP.has(cited)) return cited;
  if (cited && level && level > 1 && packHasClip(level, cited)) return cited;
  return null;
};

const clipUrl = (voice: Speaker, key: string, hanzi?: string) => {
  const level = hanzi ? characterLevel(hanzi) : undefined;
  const v = fileVoice(voice, key);
  // Bundled HSK 1 clips first: pack folders may omit a shared syllable, and a
  // missing pack URL can resolve to the SPA HTML shell with status 200.
  if (CLIP.has(key) || (v === 'c' && CMN.has(key))) {
    return `/audio/${v}/${key}.mp3`;
  }
  if (level && level > 1 && packHasClip(level, key)) {
    return `${packMediaRoot(level)}audio/${v}/${key}.mp3`;
  }
  return `/audio/${v}/${key}.mp3`;
};

export const canSpeak = (): boolean =>
  typeof Audio !== 'undefined' ||
  (typeof window !== 'undefined' && 'speechSynthesis' in window);

const FEMALE_VOICE = /ting[\s-]?ting|mei[\s-]?jia|xiao\s?xiao|xiao\s?yi|yun\s?xia|yao\s?yao|hui\s?hui|sin[\s-]?ji|yu[\s-]?shu|female|woman|mujer|\b女\b/i;
const MALE_VOICE = /yun\s?yang|yun\s?jian|yun\s?xi|kang[\s-]?kang|li[\s-]?mu|li\s?sheng|yun\s?hao|male|\bman\b|hombre|\b男\b/i;

const classifyTtsVoice = (voice: SpeechSynthesisVoice): TtsGender | null => {
  if (FEMALE_VOICE.test(voice.name)) return 'f';
  if (MALE_VOICE.test(voice.name)) return 'm';
  return null;
};

const chineseVoices = (): SpeechSynthesisVoice[] => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter(
    (item) => item.lang === 'zh-CN' || item.lang === 'zh-TW' || item.lang.startsWith('zh'),
  );
};

const pickTtsVoice = (prefer: TtsGender): SpeechSynthesisVoice | null => {
  const all = chineseVoices();
  if (!all.length) return null;
  const match = all.find((item) => classifyTtsVoice(item) === prefer);
  if (match) return match;
  // One installed Chinese voice covers both taps.
  return all.find((item) => item.lang === 'zh-CN') ?? all[0] ?? null;
};

const tts = (
  text: string,
  done?: () => void,
  unavailable?: () => void,
  gender: TtsGender = 'm',
): void => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined' || !text) {
    unavailable?.();
    done?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.85;
  const available = chineseVoices();
  if (available.length) {
    const chosen = pickTtsVoice(gender);
    if (!chosen) {
      unavailable?.();
      done?.();
      return;
    }
    utterance.voice = chosen;
    utterance.lang = chosen.lang;
  } else if (synth.getVoices().length) {
    // Voices finished loading and none are Chinese.
    unavailable?.();
    done?.();
    return;
  }
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    done?.();
  };
  utterance.onend = finish;
  utterance.onerror = () => { unavailable?.(); finish(); };
  try { synth.speak(utterance); } catch { unavailable?.(); finish(); }
};

/**
 * Play the pinyin in the chosen clip voice. `hanzi` lines syllables up with
 * characters, so a neutral tone that has no clip can use that character's
 * citation tone (unless `exact`). If a clip is still missing, fall back to
 * the browser voice.
 */
const playClips = (
  pinyin: string,
  hanzi: string | undefined,
  exact: boolean,
  unavailable: (() => void) | undefined,
  speaker: Speaker,
): void => {
  const id = ++playId;
  current?.pause();
  current = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();

  const parts = pinyinParts(pinyin);
  const chars = [...(hanzi ?? '')];
  const align = chars.length === parts.length && chars.length > 0;
  const keys = parts.map((part, index) => resolveKey(part.syllable, align ? chars[index] : undefined, exact));

  setSpeakingKey(speechKey(pinyin, hanzi));
  const finish = (token: number) => {
    if (token !== playId) return;
    setSpeakingKey(null);
  };

  if (!canSpeak() || keys.length === 0 || keys.some((key) => !key)) {
    tts(hanzi || pinyin, () => finish(id), () => { if (id === playId) unavailable?.(); });
    return;
  }

  const ready = keys.filter((key): key is string => key !== null);

  const playSyllables = (index: number) => {
    if (id !== playId) return;
    if (index >= ready.length) {
      finish(id);
      return;
    }
    const audio = new Audio(clipUrl(speaker, ready[index], align ? chars[index] : hanzi));
    current = audio;
    audio.onended = () => {
      const next = index + 1;
      if (id !== playId) return;
      if (next >= ready.length) {
        finish(id);
        return;
      }
      window.setTimeout(() => playSyllables(next), parts[next].gap);
    };
    const giveUp = () => {
      if (id !== playId) return;
      const fallbackId = ++playId;
      tts(hanzi || pinyin, () => finish(fallbackId), () => { if (fallbackId === playId) unavailable?.(); });
    };
    audio.onerror = giveUp;
    void audio.play().catch(giveUp);
  };

  playSyllables(0);
};

/** Taps since the learner last picked a mode. */
let turn = 0;
const TAIWAN_ORDER: Speaker[] = ['f', 'm'];
const TTS_ORDER: TtsGender[] = ['m', 'f'];

const nextTaiwan = (advance: boolean): Speaker => {
  const speaker = TAIWAN_ORDER[turn % TAIWAN_ORDER.length];
  if (advance) turn += 1;
  return speaker;
};

const nextTtsGender = (advance: boolean): TtsGender => {
  const gender = TTS_ORDER[turn % TTS_ORDER.length];
  if (advance) turn += 1;
  return gender;
};

const playForMode = (
  pinyin: string,
  hanzi: string | undefined,
  exact: boolean,
  unavailable: (() => void) | undefined,
  advance: boolean,
): void => {
  const currentMode = mode();
  if (currentMode === 'tts') {
    const id = ++playId;
    current?.pause();
    current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeakingKey(speechKey(pinyin, hanzi));
    const gender = nextTtsGender(advance);
    tts(
      hanzi || pinyin,
      () => { if (id === playId) setSpeakingKey(null); },
      () => { if (id === playId) { setSpeakingKey(null); unavailable?.(); } },
      gender,
    );
    return;
  }
  const speaker = currentMode === 'mainland' ? 'c' : nextTaiwan(advance);
  playClips(pinyin, hanzi, exact, unavailable, speaker);
};

/**
 * Play a character reading, allowing a citation-tone clip when needed.
 * With `cycle`, each tap uses the next voice inside the chosen mode.
 */
export const speak = (pinyin: string, hanzi?: string, cycle = true): void => {
  playForMode(pinyin, hanzi, false, undefined, cycle);
};

/**
 * Play a word. Pinyin stays HSK / Mainland. CNS often lacks that neutral, so
 * a missing clip uses the character's citation tone (朋友 → peng2 + you3,
 * 谢谢 → xie4 + xie4). TTS mode always synthesizes; otherwise TTS only if
 * still no clip.
 */
export const speakWord = (pinyin: string, hanzi: string, unavailable?: () => void): void => {
  playForMode(pinyin, hanzi, false, unavailable, true);
};

export const stopSpeech = (): void => {
  playId++;
  current?.pause();
  current = null;
  setSpeakingKey(null);
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
};
