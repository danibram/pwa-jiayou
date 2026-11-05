import { characterContentId, contentReferenceForCharacter, contentReferenceForWord, type CharacterContent } from '../content/revision';
import { evaluatorVersion } from '../evaluation';
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
  type SpeechAudio,
} from '../types';
import { glossHead } from '../../../utils/glossDisplay';
import { spokenMeaning } from '../../../utils/meaning';
import { hasHomograph, hasHomophone, isFunctionWord, spokenReading } from './ambiguity';
import { askGloss, displayGloss } from './glosses';
import { buildOptions } from './options';
import { shuffleWith, token } from './random';
import type {
  ExerciseContext,
  ExercisePrompt,
  ExerciseSelection,
  ItemContent,
  PlannedCardInput,
  SkipReason,
  WordEntry,
} from './types';

/**
 * Names the rule set that grades an exercise. Its revision is the evaluator version, because the
 * evaluator holds those rules; the accepted answer is the content revision the attempt stores.
 */
export type RubricId = 'self-assessment' | 'multiple-choice' | 'writing-from-memory' | 'writing-trace';
const rubric = (id: RubricId): Exercise['rubric'] => ({ id, revision: evaluatorVersion });

/** Formats that give the target among options. A word with no correct answer yet stays on them. */
const CHECKED: readonly LegacyPrompt[] = ['pick', 'recognize', 'hear'];
const PRACTICE: readonly LegacyPrompt[] = ['pick', 'recognize', 'hear', 'reverse', 'listen'];
/** Right after teaching, the answer is checked, not self-graded, as the old `withPrompts` did. */
const CHECKED_REASONS: ReadonlySet<CardReason> = new Set(['new-practice', 'teach-again']);
/** Correct observations before free-recall formats join practice, as the old `reps >= 3`. */
const SETTLED_AFTER = 3;

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
      spokenMeaning({
        definition: character.definition,
        gloss: character.gloss,
        pinyin: character.pinyin,
        example: character.example ? { word: '', pinyin: '', es: character.example.es } : undefined,
      }),
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
 * Practice formats in the order to try them. Checked formats only while the word has no correct
 * answer yet, or just after teaching; all five once it has `SETTLED_AFTER` correct ones. The skill
 * observed longest ago goes first, so practice moves between meaning, production and listening;
 * the generator breaks ties.
 */
const practiceOrder = (card: PlannedCardInput, context: ExerciseContext): LegacyPrompt[] => {
  const correct = context.recentEvidence.filter((evidence) => evidence.evaluation.outcome === 'correct').length;
  const checked = CHECKED_REASONS.has(card.reason) || correct < SETTLED_AFTER;
  const lastSeen = new Map<Skill, number>();
  for (const evidence of context.recentEvidence) {
    lastSeen.set(evidence.skill, Math.max(lastSeen.get(evidence.skill) ?? -Infinity, evidence.recordedAt));
  }
  const seenAt = (prompt: LegacyPrompt) => lastSeen.get(EXERCISE_ROLES[prompt].skill) ?? -Infinity;
  return shuffleWith(checked ? CHECKED : PRACTICE, context.random).sort((a, b) => seenAt(a) - seenAt(b));
};

const selectWord = (card: PlannedCardInput, word: WordEntry, context: ExerciseContext): ExerciseSelection => {
  const content = contentReferenceForWord(word);
  if (card.intent === 'teach') {
    return { kind: 'exposure', itemId: card.itemId, content, card: exposureCard(card.itemId, { kind: 'word', word }, 'teaching', context) };
  }
  const order: LegacyPrompt[] = card.intent === 'practice' ? practiceOrder(card, context) : [];
  const skipped: { prompt: ExercisePrompt; reason: SkipReason }[] = [];
  // The meaning card ends every chain: free recall from the characters, with the reading when the
  // characters have two, is never ambiguous.
  for (const prompt of [...order, 'meaning' as const]) {
    const built = buildWordExercise(prompt, word, card.itemId, context);
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
    rubric: rubric(memory ? 'writing-from-memory' : 'writing-trace'),
  };
  return { kind: 'exercise', itemId, content, exercise, evaluatorVersion, prompt, skipped: [] };
};

/**
 * Turns a planned card into the exercise or exposure it shows.
 *
 * - Words. `teach` is an exposure. `scheduled` and `already-known-check` are the rating task: the
 *   characters, free recall and self-assessment, asking a particle's or classifier's function (P7).
 *   `practice` tries reverse, listen, pick, hear and recognize in `practiceOrder` and skips any that
 *   would be ambiguous, need speech that is not available, or lack distractors; the meaning card
 *   closes the chain, and `skipped` lists what was passed over and why.
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
