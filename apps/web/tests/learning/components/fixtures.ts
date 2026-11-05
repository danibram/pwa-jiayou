import { vi } from 'vitest';
import { selectExercise, type ExerciseSelection, type ExercisePrompt } from '@jiayou/learning/exercises';
import { gradeTypedAnswer } from '@jiayou/learning/production';
import type { AttemptAction, Evaluation, Exercise, Skill } from '@jiayou/learning/types';
import type { LearningSessionActions, LearningSessionView } from '../../../src/components/learning/types';
import { SEEDS, card, context, settled, word, wordItem } from '../exercises/fixtures';

export const ni = word('word-4f60-597d-ni3-hao3');
export const de = word('word-7684-de5');

/**
 * Evidence histories to try. Each correct answer climbs a rung of the practice ladder: none gives
 * recognition, one the option formats, two the self-assessed recall and three the typed answers.
 * Practice starts with the skill seen longest ago, so each order puts a different skill first.
 */
const HISTORIES: readonly Skill[][] = [
  [],
  ['production'],
  ['listening'],
  ['production', 'meaning'],
  ['listening', 'meaning'],
  ['meaning', 'production', 'listening'],
  ['tones', 'meaning', 'listening'],
  ['tones', 'production', 'meaning'],
];

/** A practice selection of the given prompt, found by trying histories and seeds as the builder shuffles. */
export const practiceSelection = (prompt: ExercisePrompt, entry = ni, speechAvailable = true): Extract<ExerciseSelection, { kind: 'exercise' }> => {
  for (const history of HISTORIES) {
    for (const seed of SEEDS) {
      const recentEvidence = history.length ? settled(history) : [];
      const selection = selectExercise(card(wordItem(entry), 'practice'), { kind: 'word', word: entry }, context({ recentEvidence, speechAvailable }, seed));
      if (selection.kind === 'exercise' && selection.prompt === prompt) return selection;
    }
  }
  throw new Error(`No ${prompt} selection for ${entry.id}`);
};

export const meaningSelection = (entry = ni) => {
  const selection = selectExercise(card(wordItem(entry), 'scheduled', 'due-review'), { kind: 'word', word: entry }, context());
  if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
  return selection;
};

export const teachSelection = (speechAvailable = true) => {
  const selection = selectExercise(card(wordItem(ni), 'teach', 'new'), { kind: 'word', word: ni }, context({ speechAvailable }));
  if (selection.kind !== 'exposure') throw new Error('Expected an exposure');
  return selection;
};

export const view = (overrides: Partial<LearningSessionView> = {}): LearningSessionView => ({
  state: 'presenting',
  selection: null,
  actions: [],
  revealed: false,
  feedback: null,
  position: 2,
  total: 10,
  speechAvailable: true,
  canUndo: false,
  canClaimKnown: false,
  claimsUsedUp: false,
  error: null,
  inputError: null,
  ...overrides,
});

export const sessionActions = (): { [K in keyof LearningSessionActions]: ReturnType<typeof vi.fn> } & LearningSessionActions => ({
  answer: vi.fn(),
  reveal: vi.fn(),
  hint: vi.fn(),
  selfAssess: vi.fn(),
  drawing: vi.fn(),
  knowIt: vi.fn(),
  continue: vi.fn(),
  undoLast: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  retry: vi.fn(),
  audioFailed: vi.fn(),
});

export const optionAnswer = (optionId: string | null, outcome: Evaluation['outcome'], at = 1_000): AttemptAction => ({
  type: 'answer',
  at,
  answer: null,
  selectedOptionId: optionId,
  evaluation: outcome === 'invalid' ? { outcome, reason: 'technical-error' } : outcome === 'partial' ? { outcome, missing: [] } : { outcome },
});

/** A typed answer as the controller records it, graded with the exercise's own policy. */
export const typedAnswer = (exercise: Exercise, text: string | null, at = 1_000): AttemptAction => ({
  type: 'answer',
  at,
  answer: text,
  selectedOptionId: null,
  evaluation: text === null ? { outcome: 'unanswered' } : gradeTypedAnswer(exercise, text)!.evaluation,
});
