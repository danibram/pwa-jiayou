import { describe, expect, it } from 'vitest';
import {
  IncompleteAttemptError,
  evaluateAttempt,
  evaluatorVersion,
  type EvaluationResult,
} from '../../src/evaluation/index.ts';
import type { AttemptAction } from '../../src/types.ts';
import {
  CHAR,
  alreadyKnown,
  answer,
  attempt,
  correct,
  draw,
  due,
  hint,
  incorrect,
  listenCard,
  meaningCard,
  notDue,
  rate,
  recognizeCard,
  reveal,
  reverseCard,
  tracing,
  writingFromMemory,
} from './fixtures.ts';

const summary = (result: EvaluationResult) =>
  result.kind === 'scheduled-review'
    ? { kind: result.kind, basis: result.basis, rating: result.rating, outcome: result.evaluation.outcome }
    : result.kind === 'practice'
      ? { kind: result.kind, reason: result.reason, outcome: result.evaluation.outcome }
      : { kind: result.kind, reason: result.evaluation.reason };

describe('meaning card on a due word', () => {
  it.each([
    ['self-assessed Again', [reveal(), rate('again')], 'again', 'incorrect'],
    ['self-assessed Hard', [reveal(), rate('hard')], 'hard', 'correct'],
    ['self-assessed Good', [reveal(), rate('good')], 'good', 'correct'],
    ['self-assessed Easy', [reveal(), rate('easy')], 'easy', 'correct'],
    ['incorrect, hint, correct, rated Good', [answer(incorrect), hint(true), answer(correct), reveal(), rate('good')], 'again', 'incorrect'],
    ['a revealing hint before rating Good', [hint(true), reveal(), rate('good')], 'again', 'correct'],
    ['a revealing hint before rating Hard', [hint(true), reveal(), rate('hard')], 'again', 'correct'],
    ['a hint that does not reveal the answer', [hint(false, 'length'), reveal(), rate('good')], 'good', 'correct'],
    ['a revealing hint after the reveal', [reveal(), hint(true), rate('good')], 'good', 'correct'],
    ['a revealing hint after a correct answer', [answer(correct), hint(true), rate('good')], 'good', 'correct'],
    ['a partial answer rated Hard', [answer({ outcome: 'partial', missing: ['bien'] }), reveal(), rate('hard')], 'again', 'partial'],
    ['an unanswered card', [answer({ outcome: 'unanswered' })], 'again', 'unanswered'],
    ['rated Again, then Good on second thought', [reveal(), rate('again'), rate('good')], 'again', 'incorrect'],
  ] as const)('%s', (_name, actions: readonly AttemptAction[], rating, outcome) => {
    expect(summary(evaluateAttempt(attempt(actions), meaningCard, due))).toEqual({
      kind: 'scheduled-review', basis: 'due', rating, outcome,
    });
  });

  it('keeps the partial answer and what it missed', () => {
    const result = evaluateAttempt(attempt([answer({ outcome: 'partial', missing: ['bien'] }), rate('good')]), meaningCard, due);
    expect(result.kind === 'scheduled-review' && result.evaluation).toEqual({ outcome: 'partial', missing: ['bien'] });
  });

  it('ignores response time', () => {
    const fast: AttemptAction[] = [{ type: 'reveal', at: 1 }, { type: 'self-assessment', at: 2, rating: 'good' }];
    const slow: AttemptAction[] = [{ type: 'reveal', at: 1 }, { type: 'self-assessment', at: 600_000, rating: 'good' }];
    expect(summary(evaluateAttempt(attempt(fast), meaningCard, due))).toEqual(summary(evaluateAttempt(attempt(slow), meaningCard, due)));
  });

  it('writes the current evaluator version', () => {
    expect(evaluateAttempt(attempt([rate('good')]), meaningCard, due).evaluatorVersion).toBe(evaluatorVersion);
  });
});

describe('practice', () => {
  it.each([
    ['multiple choice right first time', recognizeCard, [answer(correct, 'o1')], 'exercise', 'correct'],
    ['multiple choice right after a miss', recognizeCard, [answer(incorrect, 'o2'), answer(correct, 'o1')], 'exercise', 'incorrect'],
    ['reverse rated Good', reverseCard, [reveal(), rate('good')], 'exercise', 'correct'],
    ['listen rated Again', listenCard, [reveal(), rate('again')], 'exercise', 'incorrect'],
  ] as const)('%s on a due word', (_name, exercise, actions: readonly AttemptAction[], reason, outcome) => {
    expect(summary(evaluateAttempt(attempt(actions), exercise, due))).toEqual({ kind: 'practice', reason, outcome });
  });

  it('a retry four cards after Again is practice: the relearning step is not due', () => {
    const result = evaluateAttempt(attempt([reveal(), rate('good')]), meaningCard, notDue);
    expect(summary(result)).toEqual({ kind: 'practice', reason: 'not-eligible', outcome: 'correct' });
  });

  it('a failed practice retry stays practice', () => {
    const result = evaluateAttempt(attempt([reveal(), rate('again')]), meaningCard, notDue);
    expect(summary(result)).toEqual({ kind: 'practice', reason: 'not-eligible', outcome: 'incorrect' });
  });

  it('a due word in Flojos is practice', () => {
    const result = evaluateAttempt(attempt([reveal(), rate('good')]), meaningCard, { ...due, sessionMode: 'weak' });
    expect(summary(result)).toEqual({ kind: 'practice', reason: 'session-mode', outcome: 'correct' });
  });

  it('easy on a practice card stays a correct practice, never a rating', () => {
    const result = evaluateAttempt(attempt([reveal(), rate('easy')]), reverseCard, due);
    expect(result).not.toHaveProperty('rating');
  });
});

describe('invalid attempts', () => {
  it('an audio failure is invalid and carries no evidence', () => {
    const actions = [answer({ outcome: 'invalid', reason: 'technical-error' })];
    const result = evaluateAttempt(attempt(actions), listenCard, due);
    expect(result).toEqual({ kind: 'invalid-attempt', evaluation: { outcome: 'invalid', reason: 'technical-error' }, evidence: [], evaluatorVersion });
  });

  it('an ambiguous question is invalid even after a wrong answer', () => {
    const actions = [answer(incorrect, 'o2'), answer({ outcome: 'invalid', reason: 'ambiguous-question' })];
    expect(summary(evaluateAttempt(attempt(actions), recognizeCard, due))).toEqual({ kind: 'invalid-attempt', reason: 'ambiguous-question' });
  });

  it('a resumed attempt whose content changed is invalid from the context', () => {
    const result = evaluateAttempt(attempt([reveal()]), meaningCard, {
      ...due, invalidation: { outcome: 'invalid', reason: 'content-changed' },
    });
    expect(summary(result)).toEqual({ kind: 'invalid-attempt', reason: 'content-changed' });
  });
});

describe('"Ya la sé"', () => {
  it('a correct recall is Good with basis already-known, without waiting a day', () => {
    const result = evaluateAttempt(attempt([reveal(), rate('good')]), meaningCard, alreadyKnown);
    expect(summary(result)).toEqual({ kind: 'scheduled-review', basis: 'already-known', rating: 'good', outcome: 'correct' });
  });

  it('Easy is written as Good', () => {
    const result = evaluateAttempt(attempt([reveal(), rate('easy')]), meaningCard, alreadyKnown);
    expect(summary(result)).toEqual({ kind: 'scheduled-review', basis: 'already-known', rating: 'good', outcome: 'correct' });
  });

  it.each([
    ['a miss', [reveal(), rate('again')], 'incorrect'],
    ['a hard recall', [reveal(), rate('hard')], 'correct'],
    ['a revealing hint', [hint(true), reveal(), rate('good')], 'correct'],
  ] as const)('%s is practice and the word follows the normal path', (_name, actions: readonly AttemptAction[], outcome) => {
    expect(summary(evaluateAttempt(attempt(actions), meaningCard, alreadyKnown))).toEqual({
      kind: 'practice', reason: 'already-known-miss', outcome,
    });
  });

  it('never rates in Flojos', () => {
    const result = evaluateAttempt(attempt([rate('good')]), meaningCard, { ...alreadyKnown, sessionMode: 'weak' });
    expect(result.kind).toBe('practice');
  });
});

describe('writing from memory', () => {
  it.each([
    [0, [draw(0)], 'good', 'correct'],
    [1, [draw(1)], 'hard', 'correct'],
    [2, [draw(2)], 'hard', 'correct'],
    [3, [draw(3)], 'again', 'incorrect'],
    [0, [hint(false, 'other'), draw(0)], 'again', 'correct'],
    [0, [draw(0, { outcome: 'unanswered' })], 'again', 'unanswered'],
  ] as const)('%i mistakes in %j', (mistakes, actions: readonly AttemptAction[], rating, outcome) => {
    const result = evaluateAttempt(attempt(actions, CHAR), writingFromMemory, { ...due, sessionMode: 'strokes' });
    expect(summary(result)).toEqual({ kind: 'scheduled-review', basis: 'due', rating, outcome });
    expect(result.evidence[0]).toMatchObject({ skill: 'writing', mistakes });
  });

  it('a hint marks the evidence as assisted', () => {
    const result = evaluateAttempt(attempt([hint(false, 'other'), draw(0)], CHAR), writingFromMemory, due);
    expect(result.evidence[0]).toMatchObject({ assisted: true, mistakes: 0 });
  });

  it('tracing is practice', () => {
    const result = evaluateAttempt(attempt([draw(0)], CHAR), tracing, due);
    expect(summary(result)).toEqual({ kind: 'practice', reason: 'exercise', outcome: 'correct' });
  });

  it('a writing exercise cannot rate a word', () => {
    expect(evaluateAttempt(attempt([draw(0)]), writingFromMemory, due).kind).toBe('practice');
  });

  it('the meaning card cannot rate a character', () => {
    expect(evaluateAttempt(attempt([rate('good')], CHAR), meaningCard, due).kind).toBe('practice');
  });
});

describe('incomplete attempts', () => {
  it.each([
    ['no actions', meaningCard, []],
    ['revealed but not rated', meaningCard, [reveal()]],
    ['a correct answer without the self-assessment', meaningCard, [answer(correct), reveal()]],
    ['writing without a drawing', writingFromMemory, [hint(true)]],
  ] as const)('%s throws', (_name, exercise, actions: readonly AttemptAction[]) => {
    expect(() => evaluateAttempt(attempt(actions, exercise === writingFromMemory ? CHAR : undefined), exercise, due))
      .toThrow(IncompleteAttemptError);
  });
});

describe('evidence', () => {
  it('records one observation of the exercise skill with a deterministic id', () => {
    const actions = [reveal(), rate('good')];
    const result = evaluateAttempt(attempt(actions), meaningCard, due);
    expect(result.evidence).toEqual([{
      id: 'attempt-1:meaning', skill: 'meaning', recordedAt: actions[1].at, evaluation: correct,
      assisted: false, confusions: [], mistakes: null,
    }]);
  });

  it('records each wrong option and the content it showed', () => {
    const actions = [answer(incorrect, 'o2'), answer(incorrect, 'o4'), answer(correct, 'o1')];
    const [observation] = evaluateAttempt(attempt(actions), recognizeCard, due).evidence;
    expect(observation.confusions).toEqual([
      { optionId: 'o2', contentId: 'word-8c22-8c22-xie4-xie5' },
      { optionId: 'o4', contentId: null },
    ]);
    expect(observation.evaluation).toEqual(incorrect);
    expect(observation.recordedAt).toBe(actions[0].at);
  });

  it('a revealing hint before the answer marks practice evidence as assisted', () => {
    const [observation] = evaluateAttempt(attempt([hint(true), answer(correct, 'o1')]), recognizeCard, due).evidence;
    expect(observation).toMatchObject({ assisted: true, evaluation: correct });
  });
});
