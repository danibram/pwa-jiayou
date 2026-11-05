import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import clips from '../src/data/syllable-clips.json';
import cmnClips from '../src/data/syllable-clips-cmn.json';
import {
  bareLetters,
  formatPinyinWord,
  groupPinyin,
  joinSyllableParts,
  parseSyllableParts,
  pinyinParts,
  splitPinyin,
  syllableKey,
  toneOf,
} from '@jiayou/chinese';

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

  it('splits a syllable into bare letters and a tone for the editor', () => {
    expect(parseSyllableParts('nǎi')).toEqual({ letters: 'nai', tone: 3 });
    expect(parseSyllableParts('nai3')).toEqual({ letters: 'nai', tone: 3 });
    expect(parseSyllableParts('lv4')).toEqual({ letters: 'lü', tone: 4 });
    expect(bareLetters('lǜ')).toBe('lü');
    expect(joinSyllableParts({ letters: 'nai', tone: 3 })).toBe('nǎi');
    expect(joinSyllableParts({ letters: 'lü', tone: 4 })).toBe('lǜ');
    expect(joinSyllableParts({ letters: 'ma', tone: 5 })).toBe('ma');
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

  it('writes the syllables of one word together, with an apostrophe before a vowel', () => {
    const known = new Set(['běi jīng', 'bà ba', 'xī ān', 'diàn huà']);
    const isWord = (syllables: string[]) => known.has(syllables.join(' ').toLowerCase());
    const text = (pinyin: string) => groupPinyin(pinyin, isWord).map((token) => token.text).join('');

    expect(text('Běi jīng')).toBe('Běijīng');
    expect(text('bà ba')).toBe('bàba');
    expect(text('Xī ān')).toBe("Xī'ān");
    expect(text('dǎ diàn huà')).toBe('dǎ diànhuà');
    expect(text('wǒ ài nǐ')).toBe('wǒ ài nǐ');
    expect(text('de, dí')).toBe('de, dí');
    expect(groupPinyin('bà ba', isWord).filter((token) => token.tone !== null).map((token) => token.tone)).toEqual([4, 5]);
  });

  it('keeps de, ma and ne apart and joins a single word for labels', () => {
    // The lexicon decides for running text: 觉得 and 妈妈 are words, 是的 is not listed.
    const known = new Set(['dà xué', 'jué de', 'mā ma']);
    const isWord = (syllables: string[]) => known.has(syllables.join(' ').toLowerCase());
    const text = (pinyin: string) => groupPinyin(pinyin, isWord).map((token) => token.text).join('');

    expect(text('shì de')).toBe('shì de');
    expect(text('dà xué')).toBe('dàxué');
    expect(text('wǒ jué de')).toBe('wǒ juéde');
    expect(text('mā ma')).toBe('māma');
    expect(formatPinyinWord('mā ma')).toBe('māma');
    expect(formatPinyinWord('gē ge')).toBe('gēge');
    expect(formatPinyinWord('xiè xie')).toBe('xièxie');
    expect(formatPinyinWord('hǎo ma')).toBe('hǎo ma');
    expect(formatPinyinWord('bà ba')).toBe('bàba');
    expect(formatPinyinWord('jīn nián')).toBe('jīnnián');
    expect(formatPinyinWord('wǒ de')).toBe('wǒ de');
    expect(formatPinyinWord('Xī ān')).toBe("Xī'ān");
  });
});
