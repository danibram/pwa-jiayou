import { fold, isFunctionWord, senseKeys, soundsSame, spokenReading } from '../exercises/ambiguity';
import { askGloss, displayGloss } from '../exercises/glosses';
import { token } from '../exercises/random';
import type { ExerciseContext, SkipReason, WordEntry } from '../exercises/types';
import type { Exercise, ExerciseRole, ItemId, RevealedAnswer, SpeechAudio } from '../types';
import { PINYIN_POLICY_VERSION } from './pinyinInput';
import { TYPED_ANSWER_POLICY_VERSION, type AcceptedAnswer } from './typedAnswer';

/**
 * The exercises typed answers make possible. All are practice. None is the meaning task, so the
 * evaluator never lets them rate (`ratingTaskOf` returns null), and each observes only its own skill.
 * - `pinyin-from-characters`: the characters, type the reading with tones. Skill `tones`.
 * - `pinyin-from-gloss`: the Spanish, type the reading. Skill `production`; tones are diagnosed
 *   but only the syllables decide, so a tone slip here does not count against production.
 * - `characters-from-audio`: the audio, type the word in characters. Skill `listening`.
 * - `gloss-from-audio`: the audio, type what it means in Spanish. Skill `listening`.
 */
export type ProductionKind = 'pinyin-from-characters' | 'pinyin-from-gloss' | 'characters-from-audio' | 'gloss-from-audio';

/** Rubric ids of exercises graded from typed text. `rubric.revision` holds the policy version. */
export type TypedRubricId = 'typed-pinyin' | 'typed-characters' | 'typed-gloss';
export const TYPED_RUBRICS: Readonly<Record<TypedRubricId, string>> = {
  'typed-pinyin': PINYIN_POLICY_VERSION,
  'typed-characters': TYPED_ANSWER_POLICY_VERSION,
  'typed-gloss': TYPED_ANSWER_POLICY_VERSION,
};

export const PRODUCTION_ROLES = {
  'pinyin-from-characters': { role: 'practice', skill: 'tones', cue: 'characters', format: 'free-recall', grading: 'automatic' },
  'pinyin-from-gloss': { role: 'practice', skill: 'production', cue: 'gloss', format: 'free-recall', grading: 'automatic' },
  'characters-from-audio': { role: 'practice', skill: 'listening', cue: 'audio', format: 'free-recall', grading: 'automatic' },
  'gloss-from-audio': { role: 'practice', skill: 'listening', cue: 'audio', format: 'free-recall', grading: 'automatic' },
} as const satisfies Record<ProductionKind, ExerciseRole>;

const RUBRIC_OF: Readonly<Record<ProductionKind, TypedRubricId>> = {
  'pinyin-from-characters': 'typed-pinyin',
  'pinyin-from-gloss': 'typed-pinyin',
  'characters-from-audio': 'typed-characters',
  'gloss-from-audio': 'typed-gloss',
};

/**
 * An exercise with the entries it accepts, copied when it is built. The evaluator has no catalog,
 * and the catalog may change before a backup is imported, so grading reads this list and nothing
 * else. Until `Exercise` declares the field, it travels as an extra property.
 */
export type ProductionExercise = Exercise & { accepted: readonly AcceptedAnswer[] };

export const toAccepted = (word: WordEntry): AcceptedAnswer => ({
  id: word.id,
  simplified: word.simplified.trim(),
  traditional: word.traditional.trim(),
  pinyin: word.pinyin.trim(),
  glosses: word.senses.map((sense) => sense.text.trim()),
});

const unique = (words: readonly WordEntry[]): WordEntry[] => {
  const seen = new Set<string>();
  return words.filter((word) => !seen.has(word.id) && seen.add(word.id));
};

/**
 * Other words the Spanish prompt fits as well as the target, by the rule `askGloss` uses to word
 * it. They share the first sense, and the second as well when the prompt shows it, or the length
 * when the prompt gives the length instead.
 */
const glossRivals = (word: WordEntry, vocabulary: readonly WordEntry[]): WordEntry[] => {
  const [first = '', second] = word.senses.map((sense) => sense.text.trim());
  const length = [...word.simplified.trim()].length;
  return vocabulary.filter((other) => {
    if (other.simplified.trim() === word.simplified.trim()) return false;
    const keys = senseKeys(other);
    if (!keys.has(fold(first))) return false;
    return second ? keys.has(fold(second)) : [...other.simplified.trim()].length === length;
  });
};

interface AcceptanceInput {
  rubricId: string;
  cue: Exercise['cue'];
  context: string | null;
}

/** The accepted entries, target first, then the others in vocabulary order. */
const acceptedFor = (target: WordEntry, exercise: AcceptanceInput, vocabulary: readonly WordEntry[]): WordEntry[] => {
  if (exercise.rubricId === 'typed-pinyin' && exercise.cue === 'characters') {
    // The characters of 还 allow hái and huán. A gloss in the context picks one.
    const homographs = vocabulary.filter((other) => other.simplified.trim() === target.simplified.trim());
    if (exercise.context === null) return unique([target, ...homographs]);
    const context = fold(exercise.context);
    return unique([target, ...homographs.filter((other) => fold(displayGloss(other)) === context)]);
  }
  if (exercise.rubricId === 'typed-pinyin' && exercise.cue === 'gloss') {
    return unique([target, ...glossRivals(target, vocabulary)]);
  }
  if (exercise.cue === 'audio') {
    // 他 and 她, 在 and 再: audio without context cannot tell them apart, so any of them is right.
    // A context, once editorial sentences exist, names one word.
    if (exercise.context !== null) return [target];
    return unique([target, ...vocabulary.filter((other) => soundsSame(target, other))]);
  }
  return [target];
};

const sameReading = (a: string, b: string) =>
  a.normalize('NFC').trim().replace(/\s+/g, ' ') === b.normalize('NFC').trim().replace(/\s+/g, ' ');

/**
 * Every entry a typed answer may name for this exercise, from the same ambiguity rules the
 * exercises module uses to build and skip cards. A reading from the characters accepts homographs,
 * a reading from the Spanish accepts words with the same senses, and an audio cue without context
 * accepts homophones.
 * The target is the vocabulary entry with the exercise's characters and spoken reading. Throws
 * when there is none.
 *
 * `buildProductionExercise` stores the result on the exercise; grading never calls this.
 */
export const acceptedAnswers = (
  exercise: Pick<Exercise, 'rubric' | 'cue' | 'context' | 'answer'>,
  vocabulary: readonly WordEntry[],
): AcceptedAnswer[] => {
  const answer = exercise.answer;
  const target =
    answer &&
    vocabulary.find((word) => word.simplified.trim() === answer.characters.trim() && sameReading(spokenReading(word), answer.pinyin));
  if (!target) throw new Error(`No vocabulary entry for exercise answer ${answer?.characters ?? '(none)'}`);
  return acceptedFor(target, { rubricId: exercise.rubric.id, cue: exercise.cue, context: exercise.context }, vocabulary).map(toAccepted);
};

export type ProductionBuild = { exercise: ProductionExercise } | { skip: SkipReason };

/**
 * Builds a typed-answer exercise for a word. Vocabulary, speech availability and the generator
 * come from the caller, as in `selectExercise`.
 *
 * The reading exercises carry no audio, because hearing the word gives the tones away; the screen
 * may speak `answer` after the answer. Like the selector, it skips an audio cue without speech and
 * a particle or classifier asked from or answered with its gloss (P7).
 */
export const buildProductionExercise = (
  kind: ProductionKind,
  word: WordEntry,
  context: Pick<ExerciseContext, 'vocabulary' | 'speechAvailable' | 'random'>,
): ProductionBuild => {
  const role = PRODUCTION_ROLES[kind];
  const rubricId = RUBRIC_OF[kind];
  const answer: RevealedAnswer = { characters: word.simplified.trim(), pinyin: spokenReading(word), meaning: displayGloss(word) };
  const speech: SpeechAudio | null = context.speechAvailable
    ? { source: 'speech-synthesis', hanzi: answer.characters, pinyin: answer.pinyin }
    : null;
  if (role.cue === 'audio' && !speech) return { skip: 'speech-unavailable' };
  if ((kind === 'pinyin-from-gloss' || kind === 'gloss-from-audio') && isFunctionWord(word)) return { skip: 'function-word' };

  let prompt: string;
  let exerciseContext: string | null = null;
  switch (kind) {
    case 'pinyin-from-characters': {
      prompt = 'Escribe el pinyin con sus tonos';
      const homograph = context.vocabulary.some((other) => other.id !== word.id && other.simplified.trim() === word.simplified.trim());
      // The gloss tells 还 hái from 还 huán without giving the reading away.
      if (homograph) exerciseContext = answer.meaning;
      break;
    }
    case 'pinyin-from-gloss': {
      const gloss = askGloss(word, context.vocabulary);
      prompt = `¿Cómo se dice «${gloss.text}»? Escribe el pinyin`;
      exerciseContext = gloss.hint;
      break;
    }
    case 'characters-from-audio':
      prompt = 'Escribe en caracteres la palabra que oyes';
      break;
    case 'gloss-from-audio':
      prompt = '¿Qué significa la palabra que oyes?';
      break;
  }

  const itemId: ItemId = `word-meaning:${word.id}`;
  const accepted = acceptedFor(word, { rubricId, cue: role.cue, context: exerciseContext }, context.vocabulary).map(toAccepted);
  return {
    exercise: {
      id: `exercise:${itemId}:${kind}:${token(context.random)}`,
      skill: role.skill,
      format: role.format,
      grading: role.grading,
      cue: role.cue,
      prompt,
      options: [],
      context: exerciseContext,
      audio: role.cue === 'audio' ? speech : null,
      answer,
      rubric: { id: rubricId, revision: TYPED_RUBRICS[rubricId] },
      accepted,
    },
  };
};
