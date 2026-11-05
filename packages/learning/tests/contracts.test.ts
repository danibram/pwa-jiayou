import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  EXERCISE_ROLES,
  REPLAY_ORDER,
  type AttemptAction,
  type ConfigId,
  type SessionMode,
  SESSION_MODE_RATES,
  STUDY_RULES,
  WRITING_FROM_MEMORY,
  type Exercise,
  type Hint,
  type ItemId,
  type SessionAttempt,
  type SkillEvidence,
  type StepUnit,
  type Evaluation,
  type FsrsState,
  type LearningBackup,
  type LearningEvent,
  type LegacyPrompt,
  type LocalDay,
  type Rating,
  type SchedulerConfig,
  type SchedulerState,
  type ValidEvaluation,
  type VoidableEventType,
} from '../src/types.ts';
// The six prompts of the retired review screen (`PROMPTS` in the removed `src/utils/vocabularySession.ts`).
const PROMPTS = ['meaning', 'reverse', 'listen', 'pick', 'hear', 'recognize'] as const;
type Prompt = (typeof PROMPTS)[number];

type ScheduledReview = Extract<LearningEvent, { type: 'scheduled-review' }>;
type Practice = Extract<LearningEvent, { type: 'practice' }>;
type InvalidAttempt = Extract<LearningEvent, { type: 'invalid-attempt' }>;
type AttemptVoided = Extract<LearningEvent, { type: 'attempt-voided' }>;
type Reviewed = Extract<SchedulerState, { state: 'learning' | 'review' | 'relearning' }>;

const config: SchedulerConfig = {
  // Shape only: a real FSRS-7 config needs exactly 34 parameters, and the adapter rejects any other count.
  algorithm: 'fsrs', modelVersion: 'FSRS-7', packageVersion: '6.0.0', parameters: Array.from({ length: 34 }, () => 0),
  desiredRetention: 0.9, maximumIntervalDays: 36500,
  enableFuzz: false, enableShortTerm: true, learningSteps: ['1m'], relearningSteps: ['10m'],
  graduatingInterval: 1, fractionalDays: true, clearStatsOnForget: false, allowModelOverride: false,
};
const configId: ConfigId = 'scheduler-config:sha256:0f1e';
const content = { contentId: 'word-4f60-597d-ni3-hao3', contentRevision: 'rev-1' };
const answer = { characters: '你好', pinyin: 'nǐ hǎo', meaning: 'hola' };
const exercise = {
  id: 'exercise-1', skill: 'meaning', format: 'free-recall', grading: 'self-assessment', cue: 'characters',
  prompt: '你好', options: [], context: null, audio: null, answer, rubric: { id: 'meaning-1', revision: 'rev-1' },
} as const;
const base = {
  schemaVersion: 1, sessionId: 'session-1', sessionMode: 'today', deviceId: 'device-1', localDay: '2026-11-05',
  itemId: 'word-meaning:word-4f60-597d-ni3-hao3', content, exercise, evaluatorVersion: '1',
} as const;

describe('learning event contracts', () => {
  it('only allows valid evaluations and ratings on scheduled reviews', () => {
    expectTypeOf<ScheduledReview['evaluation']>().toEqualTypeOf<ValidEvaluation>();
    expectTypeOf<ScheduledReview['rating']>().toEqualTypeOf<Rating>();
    // @ts-expect-error Invalid attempts do not have a scheduling rating.
    expectTypeOf<InvalidAttempt['rating']>();
    // @ts-expect-error Practice cannot carry a scheduling rating.
    expectTypeOf<Practice['rating']>();
    // @ts-expect-error An invalid evaluation cannot be a scheduled review's evaluation.
    const invalid: ScheduledReview['evaluation'] = { outcome: 'invalid', reason: 'technical-error' } satisfies Evaluation;
    void invalid;
  });

  it('requires a correct recall for hard, good and easy (D2)', () => {
    const review = { ...base, id: 'e', sequence: 1, occurredAt: 1, attemptId: 'a', type: 'scheduled-review', basis: 'due', configId, actions: [], evidence: [] } as const;
    const again: LearningEvent = { ...review, rating: 'again', evaluation: { outcome: 'correct' } };
    const missed: LearningEvent = { ...review, rating: 'again', evaluation: { outcome: 'partial', missing: ['hola'] } };
    const hard: LearningEvent = { ...review, rating: 'hard', evaluation: { outcome: 'correct' } };
    // @ts-expect-error Hard needs a correct recall.
    const hardWrong: LearningEvent = { ...review, rating: 'hard', evaluation: { outcome: 'incorrect' } };
    // @ts-expect-error Good needs a correct recall, not a partial one.
    const goodPartial: LearningEvent = { ...review, rating: 'good', evaluation: { outcome: 'partial', missing: ['hola'] } };
    expect([again, missed, hard, hardWrong, goodPartial]).toHaveLength(5);
  });

  it('cites the scheduler config by id instead of embedding it (D3)', () => {
    expectTypeOf<ScheduledReview['configId']>().toEqualTypeOf<ConfigId>();
    expectTypeOf<SchedulerState['configId']>().toEqualTypeOf<ConfigId>();
    // @ts-expect-error A scheduled review no longer embeds the config.
    expectTypeOf<ScheduledReview['config']>();
    // @ts-expect-error A config id has a fixed prefix.
    const loose: ConfigId = 'abc';
    void loose;
  });

  it('keeps one FSRS status and the full card for restore (D6)', () => {
    expectTypeOf<SchedulerState['state']>().toEqualTypeOf<FsrsState>();
    // @ts-expect-error scheduleStatus is derived from state, not stored.
    expectTypeOf<Reviewed['scheduleStatus']>();
    // @ts-expect-error The old duplicate status field is gone.
    expectTypeOf<Reviewed['status']>();
    expectTypeOf<Reviewed>().toHaveProperty('stability').toEqualTypeOf<number>();
    expectTypeOf<Reviewed>().toHaveProperty('stabilityFast').toEqualTypeOf<number>();
    expectTypeOf<Reviewed>().toHaveProperty('difficulty').toEqualTypeOf<number>();
    expectTypeOf<Reviewed>().toHaveProperty('learningStep').toEqualTypeOf<number>();
    expectTypeOf<Reviewed>().toHaveProperty('reps').toEqualTypeOf<number>();
  });

  it('stamps every event with the replay key and the local day (D1, D5)', () => {
    expect(REPLAY_ORDER).toEqual(['occurredAt', 'deviceId', 'sequence', 'id']);
    expectTypeOf<LearningEvent['localDay']>().toEqualTypeOf<LocalDay>();
    expectTypeOf<AttemptVoided['itemId']>().toEqualTypeOf<ItemId>();
    expectTypeOf<VoidableEventType>().toEqualTypeOf<'practice' | 'scheduled-review' | 'invalid-attempt'>();
    const day: LocalDay = '2026-11-05';
    // @ts-expect-error A local day is a calendar date, not a timestamp.
    const stamp: LocalDay = '1762300800000';
    void [day, stamp];
  });

  it('carries events and configs in a backup (D4)', () => {
    const backup: LearningBackup = { schemaVersion: 1, exportedAt: 5000, deviceId: 'device-1', events: [], configs: [{ id: configId, config }] };
    expectTypeOf<LearningBackup['events']>().toEqualTypeOf<readonly LearningEvent[]>();
    expect(backup.configs[0].config.enableFuzz).toBe(false);
  });
});

describe('review fixes', () => {
  it('keeps invalid outcomes out of practice and evidence', () => {
    expectTypeOf<Practice['evaluation']>().toEqualTypeOf<ValidEvaluation>();
    expectTypeOf<SkillEvidence['evaluation']>().toEqualTypeOf<ValidEvaluation>();
    expectTypeOf<InvalidAttempt['evaluation']['reason']>().toEqualTypeOf<'technical-error' | 'ambiguous-question' | 'content-changed' | 'other'>();
    // @ts-expect-error Evidence belongs to its event and does not repeat the item.
    expectTypeOf<SkillEvidence['itemId']>();
  });

  it('names items from their content id and steps like ts-fsrs', () => {
    const word: ItemId = 'word-meaning:word-4f60-597d-ni3-hao3';
    const char: ItemId = 'character-writing:char-4f60';
    // @ts-expect-error An item id carries its kind.
    const loose: ItemId = 'item-1';
    const step: StepUnit = '10m';
    // @ts-expect-error ts-fsrs steps have no seconds.
    const seconds: StepUnit = '30s';
    void [word, char, loose, step, seconds];
  });

  it('fixes the event id when the attempt opens and records what a hint gives away', () => {
    expectTypeOf<SessionAttempt['eventId']>().toEqualTypeOf<string>();
    expectTypeOf<Hint['revealsAnswer']>().toEqualTypeOf<boolean>();
    expectTypeOf<Exercise['audio']>().toEqualTypeOf<{ source: 'speech-synthesis'; hanzi: string; pinyin: string } | null>();
    // @ts-expect-error An exposure is shown, not graded: it has no rubric.
    expectTypeOf<Extract<LearningEvent, { type: 'exposure' }>['card']['rubric']>();
  });
});

describe('study decisions', () => {
  it('lets "Ya la sé" write only a correct Good without the wait (P4)', () => {
    const review = { ...base, id: 'k', sequence: 9, occurredAt: 9, attemptId: 'k', type: 'scheduled-review', configId, actions: [], evidence: [] } as const;
    const known: LearningEvent = { ...review, basis: 'already-known', rating: 'good', evaluation: { outcome: 'correct' } };
    // @ts-expect-error A miss on the "Ya la sé" card is practice, not a rating.
    const knownMiss: LearningEvent = { ...review, basis: 'already-known', rating: 'again', evaluation: { outcome: 'incorrect' } };
    // @ts-expect-error The check only ever rates Good.
    const knownHard: LearningEvent = { ...review, basis: 'already-known', rating: 'hard', evaluation: { outcome: 'correct' } };
    expect([known, knownMiss, knownHard]).toHaveLength(3);
  });

  it('records the session mode on every event, and Flojos never rates (P3)', () => {
    expectTypeOf<LearningEvent['sessionMode']>().toEqualTypeOf<SessionMode>();
    expect(Object.entries(SESSION_MODE_RATES).filter(([, rates]) => !rates).map(([mode]) => mode)).toEqual(['weak']);
    expect(STUDY_RULES).toMatchObject({ weakWindowDays: 30, weakRecoveryStreak: 2, masteredStabilityDays: 21, tomorrowLoadLimit: 60, requeueGap: 4 });
  });

  it('keeps a taught word unrated until the day after a correct practice (P1)', () => {
    type Fresh = Extract<SchedulerState, { state: 'new' }>;
    expectTypeOf<Fresh['eligibleFrom']>().toEqualTypeOf<LocalDay | null>();
  });

  it('stores the mistake count of a drawing from memory (P8)', () => {
    const drawing: AttemptAction = { type: 'drawing', at: 1, mistakes: 2, evaluation: { outcome: 'correct' } };
    expect(WRITING_FROM_MEMORY).toEqual({ goodMaxMistakes: 0, hardMaxMistakes: 2, hintRating: 'again' });
    void drawing;
  });
});

describe('existing exercises (D2)', () => {
  it('maps every prompt the review screen uses', () => {
    expectTypeOf<LegacyPrompt>().toEqualTypeOf<Prompt>();
    expect(Object.keys(EXERCISE_ROLES).sort()).toEqual([...PROMPTS].sort());
  });

  it('lets only free recall of the meaning from the characters rate a word', () => {
    const scheduled = Object.entries(EXERCISE_ROLES).filter(([, role]) => role.role === 'scheduled-review');
    expect(scheduled).toEqual([['meaning', { role: 'scheduled-review', skill: 'meaning', cue: 'characters', format: 'free-recall', grading: 'self-assessment' }]]);
    for (const role of Object.values(EXERCISE_ROLES)) {
      if (role.format === 'multiple-choice') expect(role.grading).toBe('automatic');
    }
  });
});

const events = [
  {
    ...base, id: 'event-1', sequence: 1, occurredAt: 1000, attemptId: 'attempt-1', type: 'scheduled-review',
    actions: [
      { type: 'reveal', at: 1000 },
      { type: 'self-assessment', at: 1200, rating: 'again' },
    ],
    evidence: [], evaluation: { outcome: 'incorrect' }, rating: 'again', basis: 'due', configId,
  },
  {
    ...base, id: 'event-2', sequence: 2, occurredAt: 2000, attemptId: 'attempt-2', type: 'practice',
    exercise: { ...exercise, id: 'exercise-2', format: 'multiple-choice', grading: 'automatic', options: [{ id: 'option-1', text: 'hola' }] },
    actions: [{ type: 'answer', at: 2000, answer: null, selectedOptionId: 'option-1', evaluation: { outcome: 'correct' } }],
    evidence: [], evaluation: { outcome: 'correct' },
  },
  {
    ...base, id: 'event-3', sequence: 3, occurredAt: 3000, attemptId: 'attempt-3', type: 'invalid-attempt',
    exercise: { ...exercise, skill: 'listening', cue: 'audio', audio: { source: 'speech-synthesis', hanzi: '你好', pinyin: 'nǐ hǎo' } },
    actions: [], evidence: [], evaluation: { outcome: 'invalid', reason: 'technical-error' },
  },
  {
    ...base, id: 'event-4', sequence: 4, occurredAt: 601000, attemptId: 'attempt-4', type: 'scheduled-review',
    actions: [
      { type: 'reveal', at: 601000 },
      { type: 'self-assessment', at: 601500, rating: 'good' },
    ],
    evidence: [], evaluation: { outcome: 'correct' }, rating: 'good', basis: 'due', configId,
  },
  {
    schemaVersion: 1, sessionId: 'session-1', sessionMode: 'today', deviceId: 'device-1', localDay: '2026-11-05',
    id: 'event-5', sequence: 5, occurredAt: 602000, type: 'attempt-voided',
    itemId: 'word-meaning:word-4f60-597d-ni3-hao3', targetEventId: 'event-4', reason: 'user-correction',
  },
] as const satisfies readonly LearningEvent[];

it('retains an initial failure, practice, invalid audio, a later due review and its undo', () => {
  expect(events.map(event => event.type)).toEqual(['scheduled-review', 'practice', 'invalid-attempt', 'scheduled-review', 'attempt-voided']);
  expect(events[0].rating).toBe('again');
  expect(events[1].actions[0].evaluation.outcome).toBe('correct');
  expect(events[2].evaluation.reason).toBe('technical-error');
  expect(events[3].sessionId).toBe(events[0].sessionId);
  expect(events[3].attemptId).not.toBe(events[0].attemptId);
  expect(events[4].targetEventId).toBe(events[3].id);
});
