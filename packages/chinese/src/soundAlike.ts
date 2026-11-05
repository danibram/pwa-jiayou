import { foldPinyin, toneOf } from './pinyin.ts';
import type { Tone } from './syllables.ts';

export interface Reading {
  /** Syllables without tone marks: "shi jian" → ["shi", "jian"]. */
  bases: string[];
  tones: Tone[];
}

/** Undefined for anything that is not plain pinyin syllables (several readings, punctuation). */
export const readingOf = (pinyin: string): Reading | undefined => {
  const syllables = pinyin.trim().split(/\s+/).filter(Boolean);
  if (!syllables.length || syllables.some((s) => !/^[a-zA-Züüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ]+$/.test(s))) return undefined;
  return { bases: syllables.map(foldPinyin), tones: syllables.map(toneOf) };
};

export type SoundMatch = 'same' | 'tone';

/**
 * How `other` sounds next to `target`: the same syllables and tones, the same syllables in
 * other tones, or nothing alike. Different syllable counts never match.
 */
export const soundMatch = (target: Reading, other: Reading): SoundMatch | undefined => {
  if (target.bases.length !== other.bases.length) return undefined;
  if (target.bases.some((base, i) => base !== other.bases[i])) return undefined;
  return target.tones.every((tone, i) => tone === other.tones[i]) ? 'same' : 'tone';
};

/** Same sound first, then lower levels; items without a level (Extra) go last. */
export const bySound = <T extends { match: string; level?: number }>(a: T, b: T) =>
  Number(a.match === 'tone') - Number(b.match === 'tone') || (a.level ?? 7) - (b.level ?? 7);
