// Turns a planned session card into the exercise or exposure it shows. Pure: speech availability,
// vocabulary and randomness come from the caller.
export { selectExercise, exposureCard, practiceRung, PRACTICE_LADDER, STROKE_RUBRIC_REVISION, type PracticePrompt, type RubricId } from './selectExercise.ts';
export { buildOptions, MIN_DISTRACTORS, MAX_DISTRACTORS, type ChoiceOption, type OptionRequest } from './options.ts';
export { askGloss, displayGloss, type AskedGloss } from './glosses.ts';
export { hasHomograph, hasHomophone, isFunctionWord, isHomograph, sharesSense, soundsSame, spokenReading } from './ambiguity.ts';
export { seededRandom, shuffleWith } from './random.ts';
export type {
  ExerciseContext,
  ExercisePrompt,
  ExerciseSelection,
  ItemContent,
  PlannedCardInput,
  SkipReason,
  WordEntry,
  WritingPrompt,
} from './types.ts';
