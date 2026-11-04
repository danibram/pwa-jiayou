import type { HskLevel } from '../types';
import { characterLevel } from '../data/catalog';
import starter from '../data/vocabulary/starter.json';

interface OrderableWord {
  level?: HskLevel;
  simplified?: string;
  characters: string[];
}

/** Words a beginner can use on day one (hola, yo, gracias, uno…), taught before the frequency order. */
export const STARTER_WORDS: readonly string[] = Array.isArray(starter.words) ? starter.words : [];

/** For sorting by level: words outside HSK go after HSK 6. */
export const levelRank = (word: { level?: HskLevel }): number => word.level ?? 7;

/** A character's place in frequency order. Characters of unloaded levels sort after loaded ones of the same level. */
const charRank = (char: string, ranks: Map<string, number>): number =>
  ranks.get(char) ?? 100_000 + (characterLevel(char) ?? 7) * 10_000;

/**
 * New words in teaching order: the starter words first, in their order, then each level by the
 * frequency of its rarest character, then the levels interleaved, lowest level first.
 * Frequency alone opens with particles (的, 了) that a beginner cannot use yet.
 */
export const orderForLearning = <T extends OrderableWord>(words: T[], frequencyOrder: readonly string[], starterWords: readonly string[] = STARTER_WORDS): T[] => {
  const ranks = new Map<string, number>();
  frequencyOrder.forEach((char, index) => { if (!ranks.has(char)) ranks.set(char, index); });
  const first = new Map(starterWords.map((word, index) => [word, index - starterWords.length]));
  const score = (word: T) => (word.simplified !== undefined && first.has(word.simplified) ? first.get(word.simplified)! : Math.max(...word.characters.map((char) => charRank(char, ranks)), 0));
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
