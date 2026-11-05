import type { ConfigId, Exercise, ItemId, LearningEvent, LocalDay, Rating, Timestamp, ValidEvaluation } from '../../src/types.ts';
import type { LocalDayRule } from '../../src/scheduler/index.ts';

export const WORD: ItemId = 'word-meaning:word-4f60-597d-ni3-hao3';
export const OTHER_WORD: ItemId = 'word-meaning:word-8c22-8c22-xie4-xie5';

const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** 2026-01-01T00:00:00Z. The library rejects the epoch itself, so fixtures stay in 2026. */
export const T0: Timestamp = Date.UTC(2026, 0, 1);
export const at = (days: number, hours = 0): Timestamp => T0 + days * DAY + hours * HOUR;

/** UTC days, so tests do not depend on the machine's time zone. */
export const utcRule: LocalDayRule = {
  localDay: (now) => new Date(now).toISOString().slice(0, 10) as LocalDay,
  nextLocalMidnight: (now) => Math.floor(now / DAY) * DAY + DAY,
};
const dayOf = (time: Timestamp) => utcRule.localDay(time);

const content = { contentId: 'word-4f60-597d-ni3-hao3', contentRevision: 'w1:test' };
const answer = { characters: '你好', pinyin: 'nǐ hǎo', meaning: 'hola' };
const exercise: Exercise = {
  id: 'exercise-meaning',
  skill: 'meaning',
  format: 'free-recall',
  grading: 'self-assessment',
  cue: 'characters',
  prompt: '¿Qué significa esta palabra?',
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
  localDay?: LocalDay;
}

const base = ({ id, occurredAt, deviceId = 'device-a', sequence = 0, localDay }: Common) => ({
  schemaVersion: 1 as const,
  id,
  sessionId: 'session-1',
  sessionMode: 'today' as const,
  deviceId,
  sequence,
  occurredAt,
  localDay: localDay ?? dayOf(occurredAt),
});

const attempt = (common: Common & { attemptId?: string }) => ({
  ...base(common),
  itemId: common.itemId ?? WORD,
  attemptId: common.attemptId ?? `attempt-${common.id}`,
  content,
  exercise,
  evaluatorVersion: 'test-1',
  actions: [],
  evidence: [],
});

export const exposure = (common: Common & { reason?: 'teaching' | 'already-known' }): LearningEvent => ({
  ...base(common),
  type: 'exposure',
  itemId: common.itemId ?? WORD,
  content,
  card: { id: `card-${common.id}`, reason: common.reason ?? 'teaching', answer, audio: null },
});

export const practice = (common: Common & { attemptId?: string; outcome?: ValidEvaluation['outcome'] }): LearningEvent => ({
  ...attempt(common),
  type: 'practice',
  evaluation: common.outcome === 'partial' ? { outcome: 'partial', missing: ['sense'] } : { outcome: common.outcome ?? 'correct' },
});

export const review = (common: Common & { attemptId?: string; rating: Rating; configId: ConfigId }): LearningEvent => {
  const shared = { ...attempt(common), type: 'scheduled-review' as const, configId: common.configId };
  return common.rating === 'again'
    ? { ...shared, basis: 'due', rating: 'again', evaluation: { outcome: 'incorrect' } }
    : { ...shared, basis: 'due', rating: common.rating, evaluation: { outcome: 'correct' } };
};

export const voided = (common: Common & { targetEventId: string }): LearningEvent => ({
  ...base(common),
  type: 'attempt-voided',
  itemId: common.itemId ?? WORD,
  targetEventId: common.targetEventId,
  reason: 'user-correction',
});
