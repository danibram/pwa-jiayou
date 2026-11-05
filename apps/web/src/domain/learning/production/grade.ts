import type { AttemptAction, Evaluation, Exercise } from '../types';
import { TYPED_RUBRICS, type TypedRubricId } from './exercises';
import { evaluatePinyinAgainst, type PinyinDiagnosis } from './pinyinAnswer';
import {
  evaluateCharactersAnswer,
  evaluateGlossAnswer,
  type AcceptedAnswer,
  type CharactersDiagnosis,
  type GlossDiagnosis,
} from './typedAnswer';

/** What grading reads from an exercise. Stored exercises and `EvaluableExercise` both fit. */
export type GradableExercise = Pick<Exercise, 'skill' | 'format' | 'grading' | 'cue' | 'rubric' | 'answer'> & {
  accepted?: readonly AcceptedAnswer[];
};

export type TypedGrade =
  | { kind: 'pinyin'; evaluation: Evaluation; diagnosis: PinyinDiagnosis }
  | { kind: 'characters'; evaluation: Evaluation; diagnosis: CharactersDiagnosis }
  | { kind: 'gloss'; evaluation: Evaluation; diagnosis: GlossDiagnosis };

const isTypedRubric = (id: string): id is TypedRubricId => Object.prototype.hasOwnProperty.call(TYPED_RUBRICS, id);

/**
 * Whether typed text decides this exercise. That holds for automatic free recall with a typed
 * rubric whose policy version this module implements. An exercise written under another policy version is not graded
 * here, so its recorded evaluation stands.
 */
export const isTypedAnswerExercise = (exercise: GradableExercise): boolean =>
  exercise.format === 'free-recall' &&
  exercise.grading === 'automatic' &&
  isTypedRubric(exercise.rubric.id) &&
  TYPED_RUBRICS[exercise.rubric.id] === exercise.rubric.revision;

/**
 * The accepted entries stored on the exercise. Without them, only the revealed answer is accepted.
 * Its reading is the spoken one, which the policy accepts as well.
 */
const acceptedOf = (exercise: GradableExercise): readonly AcceptedAnswer[] | null => {
  if (exercise.accepted && exercise.accepted.length > 0) return exercise.accepted;
  const answer = exercise.answer;
  if (!answer) return null;
  return [{ id: '', simplified: answer.characters, traditional: answer.characters, pinyin: answer.pinyin, glosses: [answer.meaning] }];
};

/**
 * Grades one typed answer. Null when the exercise is not graded from typed text, or when it has
 * neither accepted entries nor a revealed answer to grade against (only a damaged stored event
 * lacks both). Empty text is `unanswered`. Typed pinyin requires tones when the exercise trains
 * `tones` and only reports them otherwise.
 */
export const gradeTypedAnswer = (exercise: GradableExercise, text: string | null): TypedGrade | null => {
  if (!isTypedAnswerExercise(exercise)) return null;
  const accepted = acceptedOf(exercise);
  if (!accepted) return null;
  const input = text ?? '';
  switch (exercise.rubric.id as TypedRubricId) {
    case 'typed-pinyin':
      return { kind: 'pinyin', ...evaluatePinyinAgainst(input, accepted, exercise.skill === 'tones' ? 'required' : 'reported') };
    case 'typed-characters':
      return { kind: 'characters', ...evaluateCharactersAnswer(input, accepted) };
    case 'typed-gloss':
      return { kind: 'gloss', ...evaluateGlossAnswer(input, accepted) };
  }
};

/**
 * The actions with every typed answer graded again from its text. The evaluator calls it so that
 * the evaluation the screen recorded never decides a typed answer. Other actions, answers
 * without text and exercises not graded from typed text come back as they were. Returns the same
 * array when nothing changes.
 *
 * No exercise before `learning-evaluator@2` is automatic free recall, so on events written under
 * `@1` this returns its input unchanged.
 */
export const regradeTypedAnswers = (exercise: GradableExercise, actions: readonly AttemptAction[]): readonly AttemptAction[] => {
  if (!isTypedAnswerExercise(exercise)) return actions;
  let changed = false;
  const next = actions.map((action): AttemptAction => {
    if (action.type !== 'answer' || action.answer === null) return action;
    const grade = gradeTypedAnswer(exercise, action.answer);
    if (!grade || sameEvaluation(grade.evaluation, action.evaluation)) return action;
    changed = true;
    return { ...action, evaluation: grade.evaluation };
  });
  return changed ? next : actions;
};

const sameEvaluation = (a: Evaluation, b: Evaluation): boolean =>
  a.outcome === b.outcome &&
  (a.outcome !== 'invalid' || (b.outcome === 'invalid' && a.reason === b.reason)) &&
  (a.outcome !== 'partial' || (b.outcome === 'partial' && a.missing.join('\u0000') === b.missing.join('\u0000')));
