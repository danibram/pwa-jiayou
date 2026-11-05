// Typed answers. This module holds the pinyin policy, the rules for typed characters and glosses,
// the exercises they make possible and the grading the evaluator calls. It reads no clock, storage
// or DOM.
export {
  PINYIN_POLICY_VERSION,
  parsePinyinInput,
  syllableBase,
  type ParsedPinyin,
  type PinyinFormatError,
  type PinyinLetter,
  type PinyinToken,
} from './pinyinInput';
export {
  evaluatePinyinAgainst,
  evaluatePinyinAnswer,
  expectedReading,
  type ExpectedSyllable,
  type GivenSyllable,
  type PinyinDiagnosis,
  type PinyinResult,
  type PinyinTarget,
  type SyllableError,
  type ToneError,
  type TonePolicy,
} from './pinyinAnswer';
export {
  TYPED_ANSWER_POLICY_VERSION,
  evaluateCharactersAnswer,
  evaluateGlossAnswer,
  glossForms,
  type AcceptedAnswer,
  type CharactersDiagnosis,
  type GlossDiagnosis,
} from './typedAnswer';
export {
  PRODUCTION_ROLES,
  TYPED_RUBRICS,
  acceptedAnswers,
  buildProductionExercise,
  toAccepted,
  type ProductionBuild,
  type ProductionExercise,
  type ProductionKind,
  type TypedRubricId,
} from './exercises';
export { gradeTypedAnswer, isTypedAnswerExercise, regradeTypedAnswers, type GradableExercise, type TypedGrade } from './grade';
