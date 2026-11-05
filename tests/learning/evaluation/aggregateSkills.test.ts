import { describe, expect, it } from 'vitest';
import { aggregateSkills } from '../../../src/domain/learning/evidence';
import type { LearningEvent, SkillEvidence, ValidEvaluation } from '../../../src/domain/learning/types';
import { CHAR, WORD, correct, incorrect, storedPractice } from './fixtures';

const evidence = (skill: SkillEvidence['skill'], recordedAt: number, evaluation: ValidEvaluation): SkillEvidence => ({
  id: `${skill}-${recordedAt}`, skill, recordedAt, evaluation, assisted: false, confusions: [], mistakes: null,
});

const practice = (id: string, itemId: typeof WORD | typeof CHAR, items: SkillEvidence[], overrides: Record<string, unknown> = {}) =>
  storedPractice([], correct, { id, itemId, attemptId: id, evidence: items, ...overrides });

const voids = (targetEventId: string, itemId = WORD): LearningEvent =>
  ({ ...storedPractice([], correct), id: `void-${targetEventId}`, type: 'attempt-voided', itemId, targetEventId, reason: 'user-correction' }) as unknown as LearningEvent;

describe('aggregateSkills', () => {
  it('counts observations per item and skill, sorted by item then skill', () => {
    const events = [
      practice('a', WORD, [evidence('meaning', 100, correct)]),
      practice('b', WORD, [evidence('meaning', 200, incorrect)]),
      practice('c', WORD, [evidence('listening', 150, correct)]),
      practice('d', CHAR, [evidence('writing', 50, { outcome: 'partial', missing: ['trazo'] })]),
    ];
    expect(aggregateSkills(events)).toEqual([
      { itemId: CHAR, skill: 'writing', observations: 1, correct: 0, lastObservedAt: 50, lastOutcome: 'partial' },
      { itemId: WORD, skill: 'listening', observations: 1, correct: 1, lastObservedAt: 150, lastOutcome: 'correct' },
      { itemId: WORD, skill: 'meaning', observations: 2, correct: 1, lastObservedAt: 200, lastOutcome: 'incorrect' },
    ]);
  });

  it('drops the evidence of voided events', () => {
    const events = [
      practice('a', WORD, [evidence('meaning', 100, correct)]),
      practice('b', WORD, [evidence('meaning', 200, incorrect)]),
      voids('b'),
    ];
    expect(aggregateSkills(events)).toEqual([
      { itemId: WORD, skill: 'meaning', observations: 1, correct: 1, lastObservedAt: 100, lastOutcome: 'correct' },
    ]);
  });

  it('does not depend on the order events arrive in', () => {
    const events = [
      practice('a', WORD, [evidence('meaning', 100, correct)], { deviceId: 'device-b' }),
      practice('b', WORD, [evidence('meaning', 100, incorrect)], { deviceId: 'device-a' }),
    ];
    expect(aggregateSkills(events)).toEqual(aggregateSkills([...events].reverse()));
    // Same instant: replay order puts device-a first, so device-b's observation is the latest.
    expect(aggregateSkills(events)[0].lastOutcome).toBe('correct');
  });

  it('ignores exposures and invalid attempts', () => {
    const invalid = storedPractice([], correct, { id: 'i', type: 'invalid-attempt', evaluation: { outcome: 'invalid', reason: 'technical-error' } });
    expect(aggregateSkills([invalid])).toEqual([]);
  });
});
