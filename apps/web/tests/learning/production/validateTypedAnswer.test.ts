import { expect, it } from 'vitest';
import { validateAttemptEvent, evaluatorVersion } from '@jiayou/learning/evaluation';
import { buildProductionExercise } from '@jiayou/learning/production';
import type { LearningEvent } from '@jiayou/learning/types';
import { context, word } from '../exercises/fixtures';

const w = word('word-4f60-597d-ni3-hao3');
const built = buildProductionExercise('pinyin-from-characters', w, context());
if (!('exercise' in built)) throw new Error();
const event = (answer: string, recorded: 'correct' | 'incorrect', claimed: 'correct' | 'incorrect'): LearningEvent => ({
  schemaVersion: 1, id: 'e1', sessionId: 's', sessionMode: 'today', deviceId: 'd', sequence: 1, occurredAt: 1, localDay: '2026-11-05',
  itemId: `word-meaning:${w.id}`, attemptId: 'a1', content: { contentId: w.id, contentRevision: 'r' }, exercise: built.exercise,
  evaluatorVersion, actions: [{ type: 'answer', at: 1, answer, selectedOptionId: null, evaluation: { outcome: recorded } }],
  evidence: [], type: 'practice', evaluation: { outcome: claimed },
});
it('validates typed events by regrading', () => {
  expect(evaluatorVersion).toBe('learning-evaluator@4');
  expect(validateAttemptEvent(event('ni3 hao3', 'correct', 'correct'))).toEqual([]);
  expect(validateAttemptEvent(event('ni hao', 'correct', 'correct')).map((e) => e.code)).toEqual(['evaluation-mismatch']);
  expect(validateAttemptEvent({ ...event('ni3 hao3', 'correct', 'correct'), evaluatorVersion: 'learning-evaluator@1' } as LearningEvent)).toEqual([]);
});
