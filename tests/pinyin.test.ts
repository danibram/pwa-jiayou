import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import clips from '../src/data/syllable-clips.json';
import cmnClips from '../src/data/syllable-clips-cmn.json';
import { pinyinParts, splitPinyin, syllableKey, toneOf } from '../src/utils/pinyin';

const readings = () => {
  const bundled = JSON.parse(readFileSync('src/data/hsk1.json', 'utf8')) as { character: string; pinyin: string }[];
  const packs = [2, 3].flatMap(
    (level) => JSON.parse(readFileSync(`public/packs/hsk${level}.json`, 'utf8')) as { character: string; pinyin: string }[],
  );
  return [...bundled, ...packs];
};

describe('pinyin tones', () => {
  it('reads the tone from the diacritic', () => {
    expect(toneOf('mā')).toBe(1);
    expect(toneOf('má')).toBe(2);
    expect(toneOf('mǎ')).toBe(3);
    expect(toneOf('mà')).toBe(4);
    expect(toneOf('ma')).toBe(5);
    expect(toneOf('lǜ')).toBe(4);
  });

  it('splits readings and keeps separators untoned', () => {
    expect(splitPinyin('de, dí')).toEqual([
      { text: 'de', tone: 5 },
      { text: ', ', tone: null },
      { text: 'dí', tone: 2 },
    ]);
  });

  it('matches the CNS11643 filename stems', () => {
    expect(syllableKey('mā')).toBe('ma');
    expect(syllableKey('má')).toBe('ma2');
    expect(syllableKey('mǎ')).toBe('ma3');
    expect(syllableKey('mà')).toBe('ma4');
    expect(syllableKey('ma')).toBe('ma5');
    expect(syllableKey('nǚ')).toBe('nv3');
    expect(syllableKey('lǜ')).toBe('lv4');
    expect(syllableKey('yī')).toBe('yi');
  });

  it('waits longer between alternate readings than between syllables of a word', () => {
    expect(pinyinParts('wǒ de')).toEqual([
      { syllable: 'wǒ', gap: 0 },
      { syllable: 'de', gap: 80 },
    ]);
    expect(pinyinParts('de, dí')).toEqual([
      { syllable: 'de', gap: 0 },
      { syllable: 'dí', gap: 280 },
    ]);
  });

  it('has a recorded clip for every character reading', () => {
    const have = new Set(clips);
    const missing: string[] = [];
    for (const row of readings()) {
      for (const part of row.pinyin.split(/[\s,;/]+/)) {
        if (!part) continue;
        const key = syllableKey(part);
        if (!key || !have.has(key)) missing.push(`${row.character} ${part}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps Chen Wang clips inside the syllable list', () => {
    const have = new Set(clips);
    expect(cmnClips.filter((key) => !have.has(key))).toEqual([]);
    expect(cmnClips.length).toBeGreaterThan(0);
  });
});
