import { describe, expect, it } from 'vitest';
import { evaluateAttempt, validateAttemptEvent } from '../../../src/domain/learning/evaluation';
import type { LearningEvent } from '../../../src/domain/learning/types';
import {
  CHAR,
  answer,
  attempt,
  correct,
  draw,
  due,
  hint,
  incorrect,
  meaningCard,
  rate,
  recognizeCard,
  reveal,
  storedPractice,
  storedReview,
  tracing,
  writingFromMemory,
} from './fixtures';

const codes = (event: LearningEvent) => validateAttemptEvent(event).map((error) => error.code);

describe('coherent events pass', () => {
  it.each([
    ['Good', storedReview([reveal(), rate('good')], 'good')],
    ['Again after a revealing hint', storedReview([hint(true), reveal(), rate('good')], 'again', { evaluation: correct })],
    ['already known', storedReview([reveal(), rate('good')], 'good', { basis: 'already-known' })],
    ['writing with two mistakes', storedReview([draw(2)], 'hard', { itemId: CHAR, exercise: writingFromMemory })],
    ['practice after a miss', storedPractice([answer(incorrect, 'o2'), answer(correct, 'o1')], incorrect, { exercise: recognizeCard })],
    ['an invalid attempt', storedPractice([], correct, { type: 'invalid-attempt', evaluation: { outcome: 'invalid', reason: 'technical-error' } })],
  ])('%s', (_name, event) => {
    expect(validateAttemptEvent(event)).toEqual([]);
  });

  it('accepts what evaluateAttempt writes', () => {
    const actions = [answer(incorrect), hint(true), answer(correct), rate('good')];
    const result = evaluateAttempt(attempt(actions), meaningCard, due);
    if (result.kind !== 'scheduled-review') throw new Error('expected a review');
    const { kind: _kind, evaluatorVersion: _version, ...rating } = result;
    expect(validateAttemptEvent(storedReview(actions, result.rating, rating))).toEqual([]);
  });

  it('exposures and voids have nothing to check', () => {
    const voided = { ...storedPractice([], correct), type: 'attempt-voided', targetEventId: 'x', reason: 'other' } as unknown as LearningEvent;
    expect(validateAttemptEvent(voided)).toEqual([]);
  });
});

describe('incoherent events are rejected', () => {
  it.each([
    ['incorrect, hint, correct rated Good', storedReview([answer(incorrect), hint(true), answer(correct), rate('good')], 'good'), ['evaluation-mismatch', 'rating-mismatch']],
    ['a revealing hint rated Good', storedReview([hint(true), reveal(), rate('good')], 'good'), ['rating-mismatch']],
    ['Easy without a self-assessment of Easy', storedReview([reveal(), rate('good')], 'easy'), ['rating-mismatch']],
    ['Easy on writing', storedReview([draw(0)], 'easy', { itemId: CHAR, exercise: writingFromMemory }), ['rating-mismatch']],
    ['writing with three mistakes rated Hard', storedReview([draw(3)], 'hard', { itemId: CHAR, exercise: writingFromMemory }), ['evaluation-mismatch', 'rating-mismatch']],
    ['writing with a hint rated Good', storedReview([hint(false, 'other'), draw(0)], 'good', { itemId: CHAR, exercise: writingFromMemory }), ['rating-mismatch']],
    ['Hard with an incorrect evaluation', storedReview([reveal(), rate('hard')], 'hard', { evaluation: incorrect }), ['evaluation-mismatch', 'rating-without-correct-recall']],
    ['a scheduled review in Flojos', storedReview([reveal(), rate('good')], 'good', { sessionMode: 'weak' }), ['mode-does-not-rate']],
    ['a scheduled review from multiple choice', storedReview([answer(correct, 'o1')], 'good', { exercise: recognizeCard }), ['exercise-cannot-rate']],
    ['a scheduled review from tracing', storedReview([draw(0)], 'good', { itemId: CHAR, exercise: tracing }), ['exercise-cannot-rate']],
    ['already known rated Hard', storedReview([reveal(), rate('hard')], 'hard', { basis: 'already-known' }), ['already-known-not-good']],
    ['already known after a miss', storedReview([reveal(), rate('again')], 'good', { basis: 'already-known' }), ['evaluation-mismatch', 'already-known-not-good']],
    ['a review with no deciding action', storedReview([reveal()], 'good'), ['incomplete-actions']],
    ['an invalid answer inside a review', storedReview([answer({ outcome: 'invalid', reason: 'technical-error' }), rate('good')], 'good'), ['invalid-action-in-valid-event']],
    ['an unknown evaluator version', storedReview([reveal(), rate('good')], 'good', { evaluatorVersion: 'learning-evaluator@0' }), ['unknown-evaluator-version']],
    ['an unknown basis', storedReview([reveal(), rate('good')], 'good', { basis: 'guess' }), ['unknown-basis']],
    ['practice with an invalid evaluation', storedPractice([answer(correct, 'o1')], { outcome: 'invalid' } as never, { exercise: recognizeCard }), ['evaluation-kind']],
    ['practice that hides the first miss', storedPractice([answer(incorrect, 'o2'), answer(correct, 'o1')], correct, { exercise: recognizeCard }), ['evaluation-mismatch']],
    ['an invalid attempt with evidence', storedPractice([], correct, {
      type: 'invalid-attempt',
      evaluation: { outcome: 'invalid', reason: 'ambiguous-question' },
      evidence: [{ id: 'e', skill: 'meaning', recordedAt: 1, evaluation: correct }],
    }), ['invalid-evidence']],
    ['an invalid attempt with a valid evaluation', storedPractice([], correct, { type: 'invalid-attempt' }), ['evaluation-kind']],
  ])('%s', (_name, event, expected) => {
    expect(codes(event)).toEqual(expected);
  });

  it('names the event in every error', () => {
    const [error] = validateAttemptEvent(storedReview([reveal(), rate('good')], 'easy'));
    expect(error).toMatchObject({ eventId: 'event-1', code: 'rating-mismatch' });
    expect(error.message).toContain('easy');
  });
});
