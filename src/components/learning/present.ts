import type { AttemptAction, Exercise, Hint, Rating } from '../../domain/learning/types';
import type { LearningSessionView } from './types';

/** Self-assessment labels. Difícil means a correct recall that took effort, never a near miss. */
export const RATING_LABEL: Record<Rating, string> = {
  again: 'Otra vez',
  hard: 'Difícil',
  good: 'Bien',
  easy: 'Fácil',
};

/** The second line under each rating, so the scale reads as what happened, not as a score. */
export const RATING_CAPTION: Record<Rating, string> = {
  again: 'No la recordé',
  hard: 'La recordé con esfuerzo',
  good: 'La recordé',
  easy: 'Sin pensarlo',
};

export const RATING_KEY: Record<Rating, string> = { again: '1', hard: '2', good: '3', easy: '4' };

/** The input is open: no answer is being saved and the card is not showing its result. */
export const isOpen = (view: LearningSessionView) => view.state === 'presenting';

/** Wrong options in the order they were tapped, as the controller evaluated them. */
export const wrongOptionIds = (actions: readonly AttemptAction[]): string[] =>
  actions.flatMap((action) =>
    action.type === 'answer' && action.selectedOptionId !== null && action.evaluation.outcome === 'incorrect'
      ? [action.selectedOptionId]
      : [],
  );

/** The option the controller accepted, if one was. */
export const correctOptionId = (actions: readonly AttemptAction[]): string | null => {
  for (const action of actions) {
    if (action.type === 'answer' && action.selectedOptionId !== null && action.evaluation.outcome === 'correct') {
      return action.selectedOptionId;
    }
  }
  return null;
};

export const takenHints = (actions: readonly AttemptAction[]): Hint[] =>
  actions.flatMap((action) => (action.type === 'hint' ? [action.hint] : []));

/**
 * The hint a card offers on request, or null. Pinyin is the only one today.
 *
 * - Audio cue: the pinyin names the word heard, so it reveals the answer.
 * - Gloss cue: the answer is the word, and its reading is half of it, so it reveals too.
 * - Characters cue: the reading does not say what the word means. It does not reveal. A card whose
 *   context already shows the reading (还, 长) offers nothing.
 *
 * The length `askGloss` adds is not offered here: the exercise carries it as `context` because the
 * gloss alone fits two words, so the card always shows it as part of the question.
 */
export const offeredHint = (exercise: Exercise): Hint | null => {
  const pinyin = exercise.answer?.pinyin;
  if (!pinyin) return null;
  if (exercise.cue === 'characters') {
    return exercise.context === pinyin ? null : { kind: 'pinyin', revealsAnswer: false, value: pinyin };
  }
  return { kind: 'pinyin', revealsAnswer: true, value: pinyin };
};

/** The Spanish a gloss-cued prompt asks from: the text between «», or the whole prompt. */
export const askedGloss = (prompt: string): string => /«([^»]+)»/.exec(prompt)?.[1] ?? prompt;

const OUTCOME_LABEL = {
  correct: 'Bien',
  partial: 'Casi',
  incorrect: 'No acertaste',
  invalid: 'No cuenta',
} as const;

/** The short result pill. A scheduled review names the rating it wrote. */
export const feedbackLabel = (feedback: NonNullable<LearningSessionView['feedback']>): string =>
  feedback.recorded === 'scheduled-review' && feedback.rating ? RATING_LABEL[feedback.rating] : OUTCOME_LABEL[feedback.outcome];

export type FeedbackTone = 'good' | 'neutral' | 'miss';

export const feedbackTone = (feedback: NonNullable<LearningSessionView['feedback']>): FeedbackTone => {
  if (feedback.outcome === 'invalid') return 'neutral';
  if (feedback.rating === 'again' || feedback.outcome === 'incorrect') return 'miss';
  if (feedback.rating === 'hard' || feedback.outcome === 'partial') return 'neutral';
  return 'good';
};

/**
 * Whether the answer moved the schedule, said plainly. Practice says it changes nothing, so a
 * learner never takes an options card for a review.
 */
export const scheduleNote = (feedback: NonNullable<LearningSessionView['feedback']>, audioCue: boolean): string | null => {
  switch (feedback.recorded) {
    case 'scheduled-review':
      return feedback.rating === 'again'
        ? 'Cuenta como repaso. Vuelve dentro de unas tarjetas.'
        : 'Cuenta como repaso y decide cuándo vuelve.';
    case 'practice':
      return 'Esta práctica no cambia cuándo vuelve.';
    case 'invalid-attempt':
      return audioCue
        ? 'No se pudo reproducir el audio, así que esta tarjeta no cuenta.'
        : 'Esta tarjeta no cuenta para tu progreso.';
    case 'exposure':
      return null;
  }
};
