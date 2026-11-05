import { describe, expect, it } from 'vitest';
import hsk1 from '../../src/data/vocabulary/hsk1.json';
import hsk2 from '../../src/data/vocabulary/hsk2.json';
import hsk3 from '../../src/data/vocabulary/hsk3.json';
import hsk4 from '../../src/data/vocabulary/hsk4.json';
import hsk5 from '../../src/data/vocabulary/hsk5.json';
import hsk6 from '../../src/data/vocabulary/hsk6.json';
import extra from '../../src/data/vocabulary/extra.json';
import { ambiguityCases, pinyinCases } from './fixtures/contentCases';

const catalog = [...hsk1, ...hsk2, ...hsk3, ...hsk4, ...hsk5, ...hsk6, ...extra];
const byId = new Map(catalog.map((entry) => [entry.id, entry]));

describe('learning content cases', () => {
  it('keeps the declared entries, readings and senses in the catalog', () => {
    for (const example of ambiguityCases) {
      for (const entry of example.entries) {
        const actual = byId.get(entry.id);
        expect(actual, entry.id).toMatchObject({ simplified: entry.simplified, pinyin: entry.pinyin });
        expect(actual?.senses.map((sense) => sense.text), entry.id).toContain(entry.sense);
      }
    }
    for (const entry of pinyinCases) {
      expect(byId.get(entry.id), entry.id).toMatchObject({ simplified: entry.simplified, pinyin: entry.pinyin });
    }
  });

  it('preserves the distinctions each ambiguity describes', () => {
    for (const example of ambiguityCases) {
      expect(example.requiresContext).toBe(true);
      const entries = [...example.entries];
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
      if (example.kind === 'homophone' || example.kind === 'particle') {
        expect(new Set(entries.map((entry) => entry.pinyin)).size).toBe(1);
        expect(new Set(entries.map((entry) => entry.simplified)).size).toBe(entries.length);
      } else if (example.kind === 'shared-sense') {
        expect(new Set(entries.map((entry) => entry.sense)).size).toBe(1);
      } else {
        expect(new Set(entries.map((entry) => entry.simplified)).size).toBe(1);
        expect(new Set(entries.map((entry) => entry.pinyin)).size).toBe(entries.length);
      }
    }
    expect(pinyinCases.map((entry) => entry.variants[0])).toEqual(['ba4 ba5', 'xie4 xie5', 'ng4']);
  });
});
