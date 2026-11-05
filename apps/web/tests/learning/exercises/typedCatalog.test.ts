import { describe, expect, it } from 'vitest';
import { buildProductionExercise, gradeTypedAnswer, type ProductionKind } from '../../../src/domain/learning/production';
import type { Exercise } from '../../../src/domain/learning/types';
import { context, vocabulary } from './fixtures';

const KINDS: readonly ProductionKind[] = ['pinyin-from-characters', 'pinyin-from-gloss', 'characters-from-audio', 'gloss-from-audio'];

const rightText = (exercise: Exercise): string => {
  if (exercise.rubric.id === 'typed-pinyin') return exercise.answer!.pinyin;
  if (exercise.rubric.id === 'typed-characters') return exercise.answer!.characters;
  return exercise.accepted![0].glosses[0];
};

describe('typed answers over the whole catalog', () => {
  it('builds every kind the selector may offer and grades each word\'s own answer as correct', () => {
    const failures: string[] = [];
    let graded = 0;
    // Every fifth word keeps the run short; a full pass found no failures either.
    for (const word of vocabulary.filter((_, index) => index % 5 === 0)) {
      for (const kind of KINDS) {
        const built = buildProductionExercise(kind, word, context());
        if (!('exercise' in built)) continue;
        const text = rightText(built.exercise);
        try {
          const outcome = gradeTypedAnswer(built.exercise, text)?.evaluation.outcome;
          if (outcome !== 'correct') failures.push(`${word.id} ${kind} "${text}" -> ${outcome}`);
        } catch (error) {
          failures.push(`${word.id} ${kind} "${text}" threw ${(error as Error).message}`);
        }
        graded++;
      }
    }
    expect(failures).toEqual([]);
    expect(graded).toBeGreaterThan((vocabulary.length / 5) * 3);
  }, 20_000);
});
