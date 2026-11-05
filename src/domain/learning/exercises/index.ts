// Turns a planned session card into the exercise or exposure it shows. Pure: speech availability,
// vocabulary and randomness come from the caller.
export { selectExercise, exposureCard, practiceRung, PRACTICE_LADDER, type PracticePrompt, type RubricId } from './selectExercise';
export { buildOptions, MIN_DISTRACTORS, MAX_DISTRACTORS, type ChoiceOption, type OptionRequest } from './options';
export { askGloss, displayGloss, type AskedGloss } from './glosses';
export { hasHomograph, hasHomophone, isFunctionWord, isHomograph, sharesSense, soundsSame, spokenReading } from './ambiguity';
export { seededRandom, shuffleWith } from './random';
export type {
  ExerciseContext,
  ExercisePrompt,
  ExerciseSelection,
  ItemContent,
  PlannedCardInput,
  SkipReason,
  WordEntry,
  WritingPrompt,
} from './types';
