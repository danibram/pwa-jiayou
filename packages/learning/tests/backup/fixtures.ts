import { evaluatorVersion } from '../../src/evaluation/index.ts';
import { configId, DEFAULT_SCHEDULER_CONFIG } from '../../src/scheduler/index.ts';
import type {
  ConfigId,
  ContentReference,
  Exercise,
  ItemId,
  LearningEvent,
  LocalDay,
  Rating,
  SchedulerConfig,
  StoredSchedulerConfig,
  Timestamp,
} from '../../src/types.ts';

// Events that pass every backup rule. They use real config ids, the shipped evaluator version, items whose id
// matches their content. The scheduler and evaluation fixtures break some of these on purpose.

export const WORD: ItemId = 'word-meaning:word-4f60-597d-ni3-hao3';
export const OTHER_WORD: ItemId = 'word-meaning:word-8c22-8c22-xie4-xie5';
export const CHAR: ItemId = 'character-writing:char-4f60';

const DAY = 86_400_000;
/** 2026-01-01T00:00:00Z. */
export const T0: Timestamp = Date.UTC(2026, 0, 1);
export const at = (days: number, minutes = 0): Timestamp => T0 + days * DAY + minutes * 60_000;
const dayOf = (time: Timestamp) => new Date(time).toISOString().slice(0, 10) as LocalDay;

export const stored = async (config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG): Promise<StoredSchedulerConfig> => ({
  id: await configId(config),
  config: { ...config, parameters: [...config.parameters], learningSteps: [...config.learningSteps], relearningSteps: [...config.relearningSteps] },
});

const contentOf = (itemId: ItemId): ContentReference => ({
  contentId: itemId.slice(itemId.indexOf(':') + 1),
  contentRevision: itemId.startsWith('word-') ? 'w1:0123456789abcdef' : 'c1:0123456789abcdef',
});

const answer = { characters: '你好', pinyin: 'nǐ hǎo', meaning: 'hola' };

export const meaningExercise: Exercise = {
  id: 'exercise-meaning',
  skill: 'meaning',
  format: 'free-recall',
  grading: 'self-assessment',
  cue: 'characters',
  prompt: '¿Qué significa?',
  options: [],
  context: null,
  audio: null,
  answer,
  rubric: { id: 'rubric-meaning', revision: '1' },
};

interface Common {
  id: string;
  occurredAt: Timestamp;
  itemId?: ItemId;
  deviceId?: string;
  sequence?: number;
}

const base = ({ id, occurredAt, deviceId = 'device-a', sequence = 0 }: Common) => ({
  schemaVersion: 1 as const,
  id,
  sessionId: 'session-1',
  sessionMode: 'today' as const,
  deviceId,
  sequence,
  occurredAt,
  localDay: dayOf(occurredAt),
});

/** Reveal, then rate, as the meaning task's self-assessment goes. */
const selfRated = (occurredAt: Timestamp, rating: Rating) => [
  { type: 'reveal' as const, at: occurredAt - 2_000 },
  { type: 'self-assessment' as const, at: occurredAt - 1_000, rating },
];

const attempt = (common: Common & { attemptId?: string }, rating: Rating) => ({
  ...base(common),
  itemId: common.itemId ?? WORD,
  attemptId: common.attemptId ?? `attempt-${common.id}`,
  content: contentOf(common.itemId ?? WORD),
  exercise: meaningExercise,
  evaluatorVersion,
  actions: selfRated(common.occurredAt, rating),
  evidence: [],
});

export const exposure = (common: Common): LearningEvent => ({
  ...base(common),
  type: 'exposure',
  itemId: common.itemId ?? WORD,
  content: contentOf(common.itemId ?? WORD),
  card: { id: `card-${common.id}`, reason: 'teaching', answer, audio: { source: 'speech-synthesis', hanzi: '你好', pinyin: 'nǐ hǎo' } },
});

export const practice = (common: Common & { attemptId?: string }): LearningEvent => ({
  ...attempt(common, 'good'),
  type: 'practice',
  evaluation: { outcome: 'correct' },
});

export const review = (common: Common & { attemptId?: string; rating?: Rating; configId: ConfigId }): LearningEvent => {
  const rating = common.rating ?? 'good';
  const shared = { ...attempt(common, rating), type: 'scheduled-review' as const, configId: common.configId };
  return rating === 'again'
    ? { ...shared, basis: 'due', rating: 'again', evaluation: { outcome: 'incorrect' } }
    : { ...shared, basis: 'due', rating, evaluation: { outcome: 'correct' } };
};

export const invalidAttempt = (common: Common & { attemptId?: string }): LearningEvent => ({
  ...attempt(common, 'good'),
  actions: [],
  type: 'invalid-attempt',
  evaluation: { outcome: 'invalid', reason: 'technical-error' },
});

export const voided = (common: Common & { targetEventId: string }): LearningEvent => ({
  ...base(common),
  type: 'attempt-voided',
  itemId: common.itemId ?? WORD,
  targetEventId: common.targetEventId,
  reason: 'user-correction',
});

/** Two devices' logs that share a config, one event and nothing else. */
export const twoDevices = async () => {
  const config = await stored();
  const shared = exposure({ id: 'shared-exposure', occurredAt: at(0) });
  const a = {
    events: [
      shared,
      practice({ id: 'a-practice', occurredAt: at(0, 5), sequence: 1 }),
      review({ id: 'a-review', occurredAt: at(1), sequence: 2, configId: config.id }),
      voided({ id: 'a-void', occurredAt: at(1, 1), sequence: 3, targetEventId: 'a-practice' }),
    ],
    configs: [config],
  };
  const b = {
    events: [
      shared,
      exposure({ id: 'b-exposure', occurredAt: at(0, 3), itemId: OTHER_WORD, deviceId: 'device-b' }),
      review({ id: 'b-review', occurredAt: at(1, 2), itemId: OTHER_WORD, deviceId: 'device-b', sequence: 1, configId: config.id, rating: 'again' }),
      invalidAttempt({ id: 'b-invalid', occurredAt: at(2), itemId: CHAR, deviceId: 'device-b', sequence: 2 }),
    ],
    configs: [config],
  };
  return { config, a, b };
};

export const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
