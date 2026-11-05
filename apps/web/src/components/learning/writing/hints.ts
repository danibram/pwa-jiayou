import type { AttemptAction, Hint } from '@jiayou/learning/types';

// Every stroke hint shows part of the character, so each one reveals the answer. The evaluator rates
// a drawing from memory with any hint as Olvidada (decision 8 in docs/learning-system.md).

/** "Pista": the next stroke, shown on request. */
export const STROKE_HINT: Hint = { kind: 'other', revealsAnswer: true, value: 'stroke' };

/** "Contorno": the outline of the whole character under the drawing, shown on request. */
export const OUTLINE_HINT: Hint = { kind: 'answer', revealsAnswer: true, value: 'outline' };

/** The canvas showed a stroke by itself after repeated misses on it. Its number counts from 1. */
export const autoStrokeHint = (strokeNum: number): Hint => ({ kind: 'other', revealsAnswer: true, value: `auto-stroke:${strokeNum + 1}` });

/** The hints the attempt recorded so far. */
export const hintsIn = (actions: readonly AttemptAction[]): Hint[] =>
  actions.flatMap((action) => (action.type === 'hint' ? [action.hint] : []));

export const outlineTaken = (actions: readonly AttemptAction[]): boolean =>
  hintsIn(actions).some((hint) => hint.value === OUTLINE_HINT.value);

/** The mistakes of the drawing that closed the attempt, or null before it. */
export const drawnMistakes = (actions: readonly AttemptAction[]): number | null => {
  for (const action of actions) if (action.type === 'drawing') return action.mistakes;
  return null;
};
