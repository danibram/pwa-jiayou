import { readFileSync } from 'node:fs';
import hsk1 from '../../../src/data/vocabulary/hsk1.json';
import hsk2 from '../../../src/data/vocabulary/hsk2.json';
import hsk3 from '../../../src/data/vocabulary/hsk3.json';
import hsk4 from '../../../src/data/vocabulary/hsk4.json';
import hsk5 from '../../../src/data/vocabulary/hsk5.json';
import hsk6 from '../../../src/data/vocabulary/hsk6.json';
import extra from '../../../src/data/vocabulary/extra.json';
import { parseCharacterList } from '../../../src/stores/characterStore';
import { seededRandom, type ExerciseContext, type PlannedCardInput, type WordEntry } from '../../../src/domain/learning/exercises';
import type { CardIntent, CardReason, ItemId, Skill, SkillEvidence } from '../../../src/domain/learning/types';

/** Every catalog word, as the published rows carry them. */
export const vocabulary: WordEntry[] = [hsk1, hsk2, hsk3, hsk4, hsk5, hsk6, extra as WordEntry[]].flat();
const byId = new Map(vocabulary.map((word) => [word.id, word]));
export const word = (id: string): WordEntry => {
  const found = byId.get(id);
  if (!found) throw new Error(`No word ${id}`);
  return found;
};

export const hsk1Characters = parseCharacterList(JSON.parse(readFileSync('src/data/hsk1.json', 'utf8')), 1);

export const wordItem = (entry: WordEntry): ItemId => `word-meaning:${entry.id}`;

export const card = (itemId: ItemId, intent: CardIntent, reason: CardReason = 'seen'): PlannedCardInput => ({ itemId, intent, reason });

export const context = (overrides: Partial<ExerciseContext> = {}, seed = 1): ExerciseContext => ({
  vocabulary,
  speechAvailable: true,
  recentEvidence: [],
  random: seededRandom(seed),
  ...overrides,
});

let next = 0;
/** Correct observations, one per skill in turn, so practice counts the word as settled. */
export const settled = (skills: readonly Skill[] = ['meaning', 'production', 'listening']): SkillEvidence[] =>
  skills.map((skill, index) => ({
    id: `evidence-${next++}`,
    skill,
    recordedAt: 1_000 + index,
    evaluation: { outcome: 'correct' },
    assisted: false,
    confusions: [],
    mistakes: null,
  }));

export const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);
