import { describe, expect, it } from 'vitest';
import hsk1 from '../src/data/hsk1.json';
import hsk2 from '../src/data/hsk2.json';
import hsk3 from '../src/data/hsk3.json';
import { topics } from '../src/data/topics';
import type { HSKCharacter } from '../src/types';

const known = new Set(
  ([...hsk1, ...hsk2, ...hsk3] as HSKCharacter[]).map((row) => row.character)
);

describe('topics', () => {
  it('only names characters that exist, once per topic', () => {
    const missing: string[] = [];
    for (const topic of topics) {
      const seen = new Set<string>();
      for (const char of topic.characters) {
        if (!known.has(char)) missing.push(`${topic.id}:${char}`);
        expect(seen.has(char), `${topic.id} repeats ${char}`).toBe(false);
        seen.add(char);
      }
      expect(topic.characters.length).toBeGreaterThan(4);
    }
    expect(missing).toEqual([]);
  });

  it('uses a unique id and title for each topic', () => {
    expect(new Set(topics.map((topic) => topic.id)).size).toBe(topics.length);
    expect(new Set(topics.map((topic) => topic.title)).size).toBe(topics.length);
  });
});
