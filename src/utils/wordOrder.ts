import type { HskLevel } from '../types';
import { characterLevel } from '../data/catalog';

interface OrderableWord {
  level?: HskLevel;
  characters: string[];
}

/** For sorting by level: words outside HSK go after HSK 6. */
export const levelRank = (word: { level?: HskLevel }): number => word.level ?? 7;

/** A character's place in frequency order. Characters of unloaded levels sort after loaded ones of the same level. */
const charRank = (char: string, ranks: Map<string, number>): number =>
  ranks.get(char) ?? 100_000 + (characterLevel(char) ?? 7) * 10_000;

/**
 * New words in teaching order: each level by the frequency of its rarest character,
 * then the levels interleaved, lowest level first, so a mix of levels mixes from the start.
 */
export const orderForLearning = <T extends OrderableWord>(words: T[], frequencyOrder: readonly string[]): T[] => {
  const ranks = new Map<string, number>();
  frequencyOrder.forEach((char, index) => { if (!ranks.has(char)) ranks.set(char, index); });
  const score = (word: T) => Math.max(...word.characters.map((char) => charRank(char, ranks)), 0);
  const byLevel = new Map<number, T[]>();
  for (const word of words) byLevel.set(levelRank(word), [...(byLevel.get(levelRank(word)) ?? []), word]);
  const queues = [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, list]) => list
      .map((word, index) => ({ word, index, score: score(word) }))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((row) => row.word));
  const out: T[] = [];
  for (let round = 0; out.length < words.length; round++) {
    for (const queue of queues) if (round < queue.length) out.push(queue[round]);
  }
  return out;
};
