import { characterContentId, contentReferenceForCharacter, contentReferenceForWord, type CharacterContent } from '@jiayou/content';
import { evaluatorVersion } from '../evaluation/index.ts';
import {
  EXERCISE_ROLES,
  type CardReason,
  type ContentReference,
  type Exercise,
  type ExposureCard,
  type ItemId,
  type LegacyPrompt,
  type RevealedAnswer,
  type Skill,
  type SkillEvidence,
  type SpeechAudio,
} from '../types.ts';
import { glossHead } from '@jiayou/chinese';
import { buildProductionExercise, PRODUCTION_ROLES, type ProductionKind } from '../production/exercises.ts';
import { spokenMeaning } from '@jiayou/chinese';
import { hasHomograph, hasHomophone, isFunctionWord, spokenReading } from './ambiguity.ts';
import { askGloss, displayGloss } from './glosses.ts';
import { buildOptions } from './options.ts';
import { shuffleWith, token } from './random.ts';
import type {
  ExerciseContext,
  ExercisePrompt,
  ExerciseSelection,
  ItemContent,
  PlannedCardInput,
  SkipReason,
  WordEntry,
} from './types.ts';

/**
 * Names the rule set that grades an exercise. Its revision is the evaluator version, because the
 * evaluator holds those rules; the accepted answer is the content revision the attempt stores.
 */
export type RubricId = 'self-assessment' | 'multiple-choice' | 'writing-from-memory' | 'writing-trace';
const rubric = (id: RubricId): Exercise['rubric'] => ({ id, revision: evaluatorVersion });

/**
 * A drawing is graded by hanzi-writer's stroke matcher over hanzi-writer-data's stroke paths, so the
 * mistake count a writing attempt stores depends on both packages. package.json pins them exactly and
 * a test keeps this string equal to the installed versions: upgrading either changes the rubric.
 */
export const STROKE_RUBRIC_REVISION = 'hanzi-writer@3.7.3+hanzi-writer-data@2.0.1';
const strokeRubric = (id: 'writing-from-memory' | 'writing-trace'): Exercise['rubric'] => ({ id, revision: STROKE_RUBRIC_REVISION });

/** Right after teaching, practice stays on the supported rungs, as the old `withPrompts` did. */
const TEACHING_REASONS: ReadonlySet<CardReason> = new Set(['new-practice', 'teach-again']);

/** The formats practice can take: every legacy prompt but the rating task, and the typed answers. */
export type PracticePrompt = Exclude<LegacyPrompt, 'meaning'> | ProductionKind;

/**
 * The practice ladder for a word, from most supported to least. Each rung takes away an aid:
 * 0. `recognize`: the characters are shown and the meaning is among options.
 * 1. `pick` and `hear`: the word is among options, from its gloss or its sound.
 * 2. `reverse` and `listen`: free recall of the word, revealed and self-assessed.
 * 3. Typed answers: the learner writes the reading, the characters or the meaning, and the
 *    controller grades it.
 */
export const PRACTICE_LADDER: readonly (readonly PracticePrompt[])[] = [
  ['recognize'],
  ['pick', 'hear'],
  ['reverse', 'listen'],
  ['pinyin-from-characters', 'pinyin-from-gloss', 'characters-from-audio', 'gloss-from-audio'],
];
const TOP_RUNG = PRACTICE_LADDER.length - 1;
/** The rungs that check the answer among options. Teaching cards never climb above them. */
const SUPPORTED_TOP = 1;

const isProductionKind = (prompt: ExercisePrompt): prompt is ProductionKind => Object.prototype.hasOwnProperty.call(PRODUCTION_ROLES, prompt);
const skillOf = (prompt: PracticePrompt): Skill =>
  isProductionKind(prompt) ? PRODUCTION_ROLES[prompt].skill : EXERCISE_ROLES[prompt].skill;

/**
 * The rung a practice card starts from, read from the item's evidence and nothing stored apart.
 * The evidence is replayed in the order it was recorded, starting at rung 0: an autonomous correct
 * answer climbs one rung, a correct answer after a hint that gave it away stays, and any other
 * outcome steps one rung down. So a failure moves the next practice back one rung, and the word
 * climbs again as it is answered. Right after teaching (`new-practice`, `teach-again`) the rung is
 * capped at the supported formats.
 */
export const practiceRung = (card: Pick<PlannedCardInput, 'reason'>, evidence: readonly SkillEvidence[]): number => {
  const ordered = [...evidence].sort((a, b) => a.recordedAt - b.recordedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let rung = 0;
  for (const observation of ordered) {
    if (observation.evaluation.outcome !== 'correct') rung = Math.max(0, rung - 1);
    else if (!observation.assisted) rung = Math.min(TOP_RUNG, rung + 1);
  }
  return TEACHING_REASONS.has(card.reason) ? Math.min(rung, SUPPORTED_TOP) : rung;
};

type Built = { exercise: Exercise } | { skip: SkipReason };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const wordItemId = (word: WordEntry): string => `word-meaning:${word.id}`;
const characterItemId = (character: CharacterContent): string =>
  `character-writing:${characterContentId(character.character)}`;

const wordAnswer = (word: WordEntry): RevealedAnswer => ({
  characters: word.simplified.trim(),
  pinyin: spokenReading(word),
  meaning: displayGloss(word),
});

/** What the stroke page shows as the character's meaning (`spokenMeaning`, then its first sense). */
const characterMeaning = (character: CharacterContent): string =>
  capitalize(
    glossHead(
      spokenMeaning(character),
    ),
  );

const characterAnswer = (character: CharacterContent): RevealedAnswer => ({
  characters: character.character.trim(),
  pinyin: character.pinyin.trim(),
  meaning: characterMeaning(character),
});

const speech = (answer: RevealedAnswer, available: boolean): SpeechAudio | null =>
  available ? { source: 'speech-synthesis', hanzi: answer.characters, pinyin: answer.pinyin } : null;

const exerciseId = (itemId: ItemId, prompt: ExercisePrompt, random: () => number) =>
  `exercise:${itemId}:${prompt}:${token(random)}`;

/** A teaching card or the "Ya la sé" claim: the answer and its audio, shown and not answered. */
export const exposureCard = (
  itemId: ItemId,
  content: ItemContent,
  reason: ExposureCard['reason'],
  context: Pick<ExerciseContext, 'speechAvailable' | 'random'>,
): ExposureCard => {
  const answer = content.kind === 'word' ? wordAnswer(content.word) : characterAnswer(content.character);
  return { id: `exposure:${itemId}:${reason}:${token(context.random)}`, reason, answer, audio: speech(answer, context.speechAvailable) };
};

const buildWordExercise = (prompt: LegacyPrompt, word: WordEntry, itemId: ItemId, context: ExerciseContext): Built => {
  const answer = wordAnswer(word);
  const audio = speech(answer, context.speechAvailable);
  const role = EXERCISE_ROLES[prompt];
  const functionWord = isFunctionWord(word);
  // 还 and 长 have two entries each: the characters alone do not say which reading is asked.
  const readingContext = hasHomograph(word, context.vocabulary) ? answer.pinyin : null;
  const make = (fields: Pick<Exercise, 'prompt' | 'options' | 'context'>, rubricId: RubricId): Built => ({
    exercise: {
      id: exerciseId(itemId, prompt, context.random),
      skill: role.skill,
      format: role.format,
      grading: role.grading,
      cue: role.cue,
      ...fields,
      audio,
      answer,
      rubric: rubric(rubricId),
    },
  });
  const choices = (audioCue: boolean, text: (entry: WordEntry) => string) =>
    buildOptions({ target: word, vocabulary: context.vocabulary, text, audio: audioCue, familiar: context.familiar, random: context.random });

  if (role.cue === 'audio' && !audio) return { skip: 'speech-unavailable' };
  if (role.cue === 'gloss' && functionWord) return { skip: 'function-word' };

  switch (prompt) {
    case 'meaning':
      return make(
        {
          // P7: a particle or classifier is asked for its function; the answer is its editorial gloss.
          prompt: functionWord ? '¿Qué función cumple esta palabra?' : '¿Qué significa esta palabra?',
          options: [],
          context: readingContext,
        },
        'self-assessment',
      );
    case 'reverse': {
      const gloss = askGloss(word, context.vocabulary);
      if (gloss.ambiguous) return { skip: 'shared-sense' };
      return make({ prompt: `¿Cómo se escribe «${gloss.text}»?`, options: [], context: gloss.hint }, 'self-assessment');
    }
    case 'listen':
      if (hasHomophone(word, context.vocabulary)) return { skip: 'homophone' };
      return make({ prompt: '¿Qué palabra es?', options: [], context: null }, 'self-assessment');
    case 'pick': {
      // Options never share a sense with the target, so a gloss another word shares is still one answer.
      const gloss = askGloss(word, context.vocabulary);
      const options = choices(false, (entry) => entry.simplified.trim());
      if (!options) return { skip: 'too-few-distractors' };
      return make({ prompt: `¿Cómo se dice «${gloss.text}»?`, options, context: gloss.hint }, 'multiple-choice');
    }
    case 'hear': {
      const options = choices(true, (entry) => entry.simplified.trim());
      if (!options) return { skip: 'too-few-distractors' };
      return make({ prompt: '¿Qué palabra oyes?', options, context: null }, 'multiple-choice');
    }
    case 'recognize': {
      const options = choices(false, displayGloss);
      if (!options) return { skip: 'too-few-distractors' };
      return make(
        { prompt: functionWord ? '¿Qué función cumple?' : '¿Qué significa?', options, context: readingContext },
        'multiple-choice',
      );
    }
  }
};

/**
 * Practice formats in the order to try them: the card's rung, then each rung below it, then the
 * supported rungs above it when the card starts lower. Within a rung the skill observed longest ago
 * goes first, so practice moves between meaning, production, tones and listening; a skill never
 * observed counts as the oldest, and the generator breaks ties. A format that cannot be built
 * gives way to the next one, so a card never takes away more aids than its rung allows.
 */
const practiceOrder = (card: PlannedCardInput, context: ExerciseContext): PracticePrompt[] => {
  const rung = practiceRung(card, context.recentEvidence);
  const lastSeen = new Map<Skill, number>();
  for (const evidence of context.recentEvidence) {
    lastSeen.set(evidence.skill, Math.max(lastSeen.get(evidence.skill) ?? -Infinity, evidence.recordedAt));
  }
  const seenAt = (prompt: PracticePrompt) => lastSeen.get(skillOf(prompt)) ?? -Infinity;
  const rungs: number[] = [];
  for (let below = rung; below >= 0; below--) rungs.push(below);
  for (let above = rung + 1; above <= SUPPORTED_TOP; above++) rungs.push(above);
  return rungs.flatMap((index) => shuffleWith(PRACTICE_LADDER[index], context.random).sort((a, b) => seenAt(a) - seenAt(b)));
};

const buildPractice = (prompt: ExercisePrompt, word: WordEntry, itemId: ItemId, context: ExerciseContext): Built => {
  if (!isProductionKind(prompt)) return buildWordExercise(prompt as LegacyPrompt, word, itemId, context);
  const built = buildProductionExercise(prompt, word, context);
  return 'exercise' in built ? { exercise: built.exercise } : { skip: built.skip };
};

const selectWord = (card: PlannedCardInput, word: WordEntry, context: ExerciseContext): ExerciseSelection => {
  const content = contentReferenceForWord(word);
  if (card.intent === 'teach') {
    return { kind: 'exposure', itemId: card.itemId, content, card: exposureCard(card.itemId, { kind: 'word', word }, 'teaching', context) };
  }
  const order: PracticePrompt[] = card.intent === 'practice' ? practiceOrder(card, context) : [];
  const skipped: { prompt: ExercisePrompt; reason: SkipReason }[] = [];
  // The meaning card ends every chain: free recall from the characters, with the reading when the
  // characters have two, is never ambiguous.
  for (const prompt of [...order, 'meaning' as const]) {
    const built = buildPractice(prompt, word, card.itemId, context);
    if ('exercise' in built) {
      return { kind: 'exercise', itemId: card.itemId, content, exercise: built.exercise, evaluatorVersion, prompt, skipped };
    }
    skipped.push({ prompt, reason: built.skip });
  }
  throw new Error(`No exercise for ${card.itemId}`);
};

const selectCharacter = (card: PlannedCardInput, character: CharacterContent, context: ExerciseContext): ExerciseSelection => {
  const content: ContentReference = contentReferenceForCharacter(character);
  const itemId = card.itemId;
  // Watching the strokes is the teaching exposure: an Exercise needs an answer, and watching has none.
  if (card.intent === 'teach') {
    return { kind: 'exposure', itemId, content, card: exposureCard(itemId, { kind: 'character', character }, 'teaching', context) };
  }
  const answer = characterAnswer(character);
  const memory = card.intent !== 'practice';
  const prompt: ExercisePrompt = memory ? 'write-memory' : 'write-trace';
  const exercise: Exercise = {
    id: exerciseId(itemId, prompt, context.random),
    skill: 'writing',
    format: 'writing',
    // Only drawing from memory rates; the evaluator tells it apart because the cue hides the character.
    stage: memory ? 'memory' : 'trace',
    grading: 'automatic',
    cue: memory ? 'gloss' : 'characters',
    prompt: memory ? `Escribe «${answer.meaning}» de memoria` : 'Calca el carácter',
    options: [],
    // The stroke page shows the reading next to the meaning; it does not give the strokes away.
    context: answer.pinyin,
    audio: speech(answer, context.speechAvailable),
    answer,
    rubric: strokeRubric(memory ? 'writing-from-memory' : 'writing-trace'),
  };
  return { kind: 'exercise', itemId, content, exercise, evaluatorVersion, prompt, skipped: [] };
};

/**
 * Turns a planned card into the exercise or exposure it shows.
 *
 * - Words. `teach` is an exposure. `scheduled` and `already-known-check` are the rating task: the
 *   characters, free recall and self-assessment, asking a particle's or classifier's function (P7).
 *   `practice` climbs `PRACTICE_LADDER` from the item's evidence (`practiceRung`) and tries the
 *   formats in `practiceOrder`. It skips any that would be ambiguous, need speech that is not
 *   available, lack distractors or ask a function word from its gloss; the meaning card closes the
 *   chain, and `skipped` lists what was passed over and why. Typed answers are always practice.
 * - Characters. `teach` is an exposure, where the strokes are watched. `practice` is tracing.
 *   `scheduled` and `already-known-check` are drawing from memory; the evaluator writes the latter
 *   as practice, because only the meaning task takes an already-known rating.
 *
 * Throws when the content is not the item's.
 */
export const selectExercise = (card: PlannedCardInput, content: ItemContent, context: ExerciseContext): ExerciseSelection => {
  if (content.kind === 'word') {
    if (wordItemId(content.word) !== card.itemId) throw new Error(`Content ${content.word.id} is not ${card.itemId}`);
    return selectWord(card, content.word, context);
  }
  if (characterItemId(content.character) !== card.itemId) {
    throw new Error(`Content ${content.character.character} is not ${card.itemId}`);
  }
  return selectCharacter(card, content.character, context);
};
