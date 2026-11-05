import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalCharacter,
  canonicalWord,
  contentReferenceForCharacter,
  contentReferenceForWord,
  hash64,
  wordRevision,
} from '@jiayou/content';
import { extraVocabulary } from '../../../src/data/vocabulary';
import { parseCharacterList } from '../../../src/stores/characterStore';
import type { HskLevel } from '../../../src/types';
import { vocabulary } from '../../fixtures/levelWords';
import hsk1 from '../../../src/data/vocabulary/hsk1.json';
import hsk2 from '../../../src/data/vocabulary/hsk2.json';
import hsk3 from '../../../src/data/vocabulary/hsk3.json';
import hsk4 from '../../../src/data/vocabulary/hsk4.json';
import hsk5 from '../../../src/data/vocabulary/hsk5.json';
import hsk6 from '../../../src/data/vocabulary/hsk6.json';
import extra from '../../../src/data/vocabulary/extra.json';

type RawWord = (typeof hsk1)[number];
const rawWords: RawWord[] = [hsk1, hsk2, hsk3, hsk4, hsk5, hsk6, extra as RawWord[]].flat();
const rawById = new Map(rawWords.map((word) => [word.id, word]));
const raw = (id: string) => {
  const word = rawById.get(id);
  if (!word) throw new Error(`No raw entry ${id}`);
  return word;
};

/** Characters as the stroke page reads them: HSK 1 bundled, the other levels from their pack, glosses merged. */
const characters = [
  ...parseCharacterList(JSON.parse(readFileSync('src/data/hsk1.json', 'utf8')), 1),
  ...([2, 3, 4, 5, 6] as HskLevel[]).flatMap((level) =>
    parseCharacterList(JSON.parse(readFileSync(`public/packs/hsk${level}.json`, 'utf8')), level),
  ),
];

describe('word content revision', () => {
  const ai = raw('word-7231-ai4');

  it('ignores level, list, topics, source and key order', () => {
    const base = wordRevision(ai);
    // An HSK 1 word filed under Extra loses its level and source; a topic change rewrites topicIds.
    const { level: _level, ...asExtra } = ai;
    const moved: RawWord[] = [
      { ...asExtra, sourceId: 'curated-extra' } as RawWord,
      { ...ai, level: 4 },
      { ...ai, topicIds: ['comida'] },
    ];
    for (const word of moved) expect(wordRevision(word)).toBe(base);
    const reordered = {
      topicIds: ai.topicIds,
      senses: ai.senses.map(({ text, pos }) => ({ text, pos })),
      pinyin: ai.pinyin,
      traditional: ai.traditional,
      simplified: ai.simplified,
      id: ai.id,
    };
    expect(Object.keys(reordered)).not.toEqual(Object.keys(ai));
    expect(wordRevision(reordered)).toBe(base);
    expect(contentReferenceForWord(reordered)).toEqual(contentReferenceForWord(ai));
  });

  it('changes when the reading, a sense, the sense order or the first sense\'s part of speech or note changes', () => {
    const base = wordRevision(ai);
    const changed = [
      { ...ai, pinyin: 'ǎi' },
      { ...ai, senses: [ai.senses[0], { ...ai.senses[1], text: 'adorar' }] },
      { ...ai, senses: [ai.senses[1], ai.senses[0]] },
      { ...ai, senses: [...ai.senses, { pos: 'sustantivo', text: 'amor' }] },
      { ...ai, senses: [{ ...ai.senses[0], note: 'a una persona' }, ai.senses[1]] },
      { ...ai, senses: [{ text: ai.senses[0].text }, ai.senses[1]] },
      { ...ai, senses: [{ ...ai.senses[0], pos: 'partícula' }, ai.senses[1]] },
      { ...ai, traditional: '爱' },
    ].map(wordRevision);
    expect(changed).not.toContain(base);
    expect(new Set(changed).size).toBe(changed.length);
  });

  it('ignores what only the word page shows: later senses\' part of speech and notes', () => {
    const base = wordRevision(ai);
    expect(wordRevision({ ...ai, senses: [ai.senses[0], { ...ai.senses[1], pos: 'sustantivo' }] })).toBe(base);
    expect(wordRevision({ ...ai, senses: [ai.senses[0], { ...ai.senses[1], note: 'a una persona' }] })).toBe(base);
  });

  it('gives 还 hái and 还 huán their own id and revision', () => {
    const hai = contentReferenceForWord(raw('word-8fd8-hai2'));
    const huan = contentReferenceForWord(raw('word-8fd8-huan2'));
    expect(hai.contentId).not.toBe(huan.contentId);
    expect(hai.contentRevision).not.toBe(huan.contentRevision);
  });

  it('reads the same revision from a raw row and from the entry the app parses', () => {
    const parsed = new Map([...vocabulary, ...extraVocabulary].map((word) => [word.id, word]));
    expect(parsed.size).toBe(rawWords.length);
    // 一定 is written yī dìng in the list and yí dìng on the card.
    const yiding = rawWords.find((word) => word.simplified === '一定')!;
    expect(parsed.get(yiding.id)?.pinyin).not.toBe(yiding.pinyin);
    for (const word of rawWords) expect(wordRevision(parsed.get(word.id)!), word.id).toBe(wordRevision(word));
  });

  it('collapses spacing and Unicode composition but not the text', () => {
    const base = wordRevision(ai);
    // "a" followed by U+0300 COMBINING GRAVE ACCENT composes to "à" under NFC.
    expect(wordRevision({ ...ai, pinyin: ' a\u0300i ' })).toBe(base);
    expect(wordRevision(raw('word-7238-7238-ba4-ba5'))).toBe(wordRevision({ ...raw('word-7238-7238-ba4-ba5'), pinyin: 'bà  ba' }));
    expect(canonicalWord(ai).startsWith('w1:')).toBe(true);
  });

  it('pins words whose reading goes through 一 and 不 tone sandhi', () => {
    // A change to withToneSandhi changes these revisions, and every saved attempt would stop matching.
    expect(canonicalWord(raw('word-4e0d-5ba2-6c14-bu4-ke4-qi5'))).toContain('"bú kè qi"');
    expect(canonicalWord(raw('word-4e00-5b9a-yi-ding4'))).toContain('"yí dìng"');
    expect(wordRevision(raw('word-4e0d-5ba2-6c14-bu4-ke4-qi5'))).toBe('w1:e62e1d9bf9d64545');
    expect(wordRevision(raw('word-4e00-5b9a-yi-ding4'))).toBe('w1:7d9822febd40f968');
  });
});

describe('character content revision', () => {
  const de = characters.find((character) => character.character === '的')!;

  it('ignores level, radical, stroke count, frequency, the traditional form and the example word', () => {
    const base = contentReferenceForCharacter(de);
    const other: (typeof characters)[number][] = [
      { ...de, hsk_level: 3, radical: '勺', stroke_count: 9, frequency_rank: 7, traditional: '的的' },
      { ...de, example: { ...de.example!, word: '你的', pinyin: 'nǐ de' } },
    ];
    for (const character of other) expect(contentReferenceForCharacter(character)).toEqual(base);
    expect(base).toEqual({ contentId: 'char-7684', contentRevision: 'c1:1149eec057be1205' });
  });

  it('changes when anything the prompt can show changes', () => {
    const base = contentReferenceForCharacter(de).contentRevision;
    expect(de.gloss).toBeTruthy();
    expect(de.example?.es).toBeTruthy();
    const changed = [
      { ...de, pinyin: 'dí' },
      { ...de, definition: 'objetivo' },
      { ...de, gloss: 'partícula' },
      { ...de, gloss: undefined },
      { ...de, example: { ...de.example!, es: 'tuyo' } },
      { ...de, example: undefined },
      // Same strings in other positions.
      { ...de, definition: de.gloss!, gloss: de.definition },
    ].map((character) => contentReferenceForCharacter(character).contentRevision);
    expect(changed).not.toContain(base);
    expect(new Set(changed).size).toBe(changed.length);
    expect(canonicalCharacter(de).startsWith('c1:')).toBe(true);
  });
});

describe('bundled catalog', () => {
  it('gives every word and character a revision, and no two distinct forms share one', () => {
    const start = performance.now();
    const words = rawWords.map((word) => ({ reference: contentReferenceForWord(word), canonical: canonicalWord(word) }));
    const chars = characters.map((character) => ({
      reference: contentReferenceForCharacter(character),
      canonical: canonicalCharacter(character),
    }));
    const elapsed = performance.now() - start;
    console.info(`content revisions: ${words.length} words, ${chars.length} characters in ${elapsed.toFixed(1)} ms`);

    const all = [...words, ...chars];
    const ids = new Set(all.map(({ reference }) => reference.contentId));
    expect(ids.size).toBe(all.length);
    const byRevision = new Map<string, string>();
    for (const { reference, canonical } of all) {
      expect(reference.contentId).toBeTruthy();
      expect(reference.contentRevision).toMatch(/^[wc]1:[0-9a-f]{16}$/);
      const seen = byRevision.get(reference.contentRevision);
      if (seen !== undefined) expect(seen, reference.contentId).toBe(canonical);
      byRevision.set(reference.contentRevision, canonical);
    }
  });

  it('keeps every revision of the catalog', () => {
    // Fails on any change to the data, the canonical forms, tone sandhi or the gloss sidecars.
    // When the content changed on purpose, update the value; otherwise the change orphans saved attempts.
    const lines = [
      ...rawWords.map((word) => { const r = contentReferenceForWord(word); return `${r.contentId} ${r.contentRevision}`; }),
      ...characters.map((character) => { const r = contentReferenceForCharacter(character); return `${r.contentId} ${r.contentRevision}`; }),
    ].sort();
    expect(lines).toHaveLength(7655);
    expect(hash64(lines.join('\n'))).toBe('c95413c2deac68cc');
  });
});

describe('hash64', () => {
  it('hashes known strings to fixed values', () => {
    // Pinned so a change to hash64 cannot pass silently: it would orphan every saved revision.
    expect(hash64('')).toBe('488bdcb81aee8d83');
    expect(hash64('w1:a')).toBe('b1229300b0f849b4');
    expect(hash64('爱')).toBe('d2d3427b8fee74ef');
    expect(wordRevision(raw('word-7231-ai4'))).toBe('w1:82a28d00bb3af711');
  });

  it('separates strings that differ only in the high bits of their code units', () => {
    // 'A' is U+0041 and '聁' is U+8041. A lane that only multiplies never moves bit 15 down,
    // and the first version of hash64 collided three times in this set.
    let seed = 0x12345678;
    const seen = new Map<string, string>();
    for (let n = 0; n < 200_000; n++) {
      let text = '';
      for (let i = 0; i < 32; i++) {
        seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
        text += seed >>> 31 ? '\u8041' : 'A';
      }
      const hash = hash64(text);
      const before = seen.get(hash);
      if (before !== undefined && before !== text) expect.fail(`hash64 collision: ${hash}`);
      seen.set(hash, text);
    }
  });
});
