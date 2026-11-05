import { vi } from 'vitest';
import { selectExercise, type ExerciseSelection, type ExercisePrompt } from '../../../src/domain/learning/exercises';
import type { AttemptAction, Evaluation, Skill } from '../../../src/domain/learning/types';
import type { LearningSessionActions, LearningSessionView } from '../../../src/components/learning/types';
import { SEEDS, card, context, settled, word, wordItem } from '../exercises/fixtures';

export const ni = word('word-4f60-597d-ni3-hao3');
export const de = word('word-7684-de5');

/**
 * Evidence histories to try. Practice starts with the skill seen longest ago, so each order puts a
 * different skill first; the empty history keeps a word on options cards.
 */
const HISTORIES: readonly Skill[][] = [[], ['production', 'meaning', 'listening'], ['listening', 'meaning', 'production'], ['meaning', 'production', 'listening']];

/** A practice selection of the given prompt, found by trying histories and seeds as the builder shuffles. */
export const practiceSelection = (prompt: ExercisePrompt, entry = ni): Extract<ExerciseSelection, { kind: 'exercise' }> => {
  for (const history of HISTORIES) {
    for (const seed of SEEDS) {
      const recentEvidence = history.length ? settled(history) : [];
      const selection = selectExercise(card(wordItem(entry), 'practice'), { kind: 'word', word: entry }, context({ recentEvidence }, seed));
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
  error: null,
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
