import type { AttemptInput, EvaluableExercise, EvaluationContext } from '../../src/evaluation/index.ts';
import { evaluatorVersion } from '../../src/evaluation/index.ts';
import type {
  AttemptAction,
  ConfigId,
  Evaluation,
  Hint,
  ItemId,
  LearningEvent,
  Rating,
  ValidEvaluation,
} from '../../src/types.ts';

export const WORD: ItemId = 'word-meaning:word-4f60-597d-ni3-hao3';
export const CHAR: ItemId = 'character-writing:char-4f60';
export const CONFIG: ConfigId = 'scheduler-config:sha256:abc';

const base = {
  prompt: '',
  options: [],
  context: null,
  audio: null,
  answer: { characters: '你好', pinyin: 'nǐ hǎo', meaning: 'hola' },
  rubric: { id: 'rubric', revision: 'r1' },
};

export const meaningCard: EvaluableExercise = {
  ...base, id: 'ex-meaning', skill: 'meaning', format: 'free-recall', grading: 'self-assessment', cue: 'characters',
};
export const reverseCard: EvaluableExercise = {
  ...base, id: 'ex-reverse', skill: 'production', format: 'free-recall', grading: 'self-assessment', cue: 'gloss',
};
export const listenCard: EvaluableExercise = {
  ...base, id: 'ex-listen', skill: 'listening', format: 'free-recall', grading: 'self-assessment', cue: 'audio',
};
export const recognizeCard: EvaluableExercise = {
  ...base,
  id: 'ex-recognize', skill: 'meaning', format: 'multiple-choice', grading: 'automatic', cue: 'characters',
  options: [
    { id: 'o1', text: 'hola', contentId: 'word-4f60-597d-ni3-hao3' },
    { id: 'o2', text: 'gracias', contentId: 'word-8c22-8c22-xie4-xie5' },
    { id: 'o3', text: 'adiós', contentId: 'word-518d-89c1-zai4-jian4' },
    { id: 'o4', text: 'sin contenido' },
  ],
};
export const writingFromMemory: EvaluableExercise = {
  ...base, id: 'ex-write', skill: 'writing', format: 'writing', grading: 'automatic', cue: 'gloss',
};
export const tracing: EvaluableExercise = { ...writingFromMemory, id: 'ex-trace', cue: 'characters' };

let clock = 1_000;
const at = () => (clock += 1_000);

export const answer = (evaluation: Evaluation, selectedOptionId: string | null = null): AttemptAction => ({
  type: 'answer', at: at(), answer: null, selectedOptionId, evaluation,
});
export const hint = (revealsAnswer: boolean, kind: Hint['kind'] = 'pinyin'): AttemptAction => ({
  type: 'hint', at: at(), hint: { kind, revealsAnswer },
});
export const reveal = (): AttemptAction => ({ type: 'reveal', at: at() });
export const rate = (rating: Rating): AttemptAction => ({ type: 'self-assessment', at: at(), rating });
export const draw = (mistakes: number, evaluation: ValidEvaluation = { outcome: 'correct' }): AttemptAction => ({
  type: 'drawing', at: at(), mistakes, evaluation,
});

export const correct = { outcome: 'correct' } as const;
export const incorrect = { outcome: 'incorrect' } as const;

export const attempt = (actions: readonly AttemptAction[], itemId: ItemId = WORD): AttemptInput => ({
  id: 'attempt-1', itemId, actions,
});

export const due: EvaluationContext = { sessionMode: 'today', scheduledEligible: true, alreadyKnownCheck: false };
export const notDue: EvaluationContext = { ...due, scheduledEligible: false };
export const alreadyKnown: EvaluationContext = { ...due, scheduledEligible: false, alreadyKnownCheck: true };

type ScheduledReview = Extract<LearningEvent, { type: 'scheduled-review' }>;
type Practice = Extract<LearningEvent, { type: 'practice' }>;

const eventBase = {
  schemaVersion: 1 as const,
  id: 'event-1',
  sessionId: 'session-1',
  sessionMode: 'today' as const,
  deviceId: 'device-a',
  sequence: 1,
  occurredAt: 10_000,
  localDay: '2026-11-05' as const,
  itemId: WORD,
  attemptId: 'attempt-1',
  content: { contentId: 'word-4f60-597d-ni3-hao3', contentRevision: 'rev-1' },
  exercise: meaningCard,
  evaluatorVersion,
  evidence: [],
};

/** A stored review as a backup could carry it. Spread overrides to break one rule at a time. */
export const storedReview = (
  actions: readonly AttemptAction[],
  rating: ScheduledReview['rating'],
  overrides: Partial<Record<keyof ScheduledReview, unknown>> = {},
): LearningEvent =>
  ({
    ...eventBase,
    type: 'scheduled-review',
    configId: CONFIG,
    basis: 'due',
    rating,
    evaluation: rating === 'again' ? incorrect : correct,
    actions,
    ...overrides,
  }) as ScheduledReview;

export const storedPractice = (
  actions: readonly AttemptAction[],
  evaluation: ValidEvaluation,
  overrides: Partial<Record<keyof Practice, unknown>> = {},
): LearningEvent => ({ ...eventBase, type: 'practice', evaluation, actions, ...overrides }) as Practice;
