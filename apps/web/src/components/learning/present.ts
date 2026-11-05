import { gradeTypedAnswer, type TypedGrade } from '@jiayou/learning/production';
import type { AttemptAction, Exercise, Hint, Rating } from '@jiayou/learning/types';
import { markTones, type Tone } from '@jiayou/chinese';
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
  incorrect: 'No has acertado',
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

// --- Typed answers. ---

/** Which field a typed card asks for, from its rubric. */
export type TypedField = 'pinyin' | 'characters' | 'gloss';

export const typedField = (exercise: Exercise): TypedField =>
  exercise.rubric.id === 'typed-pinyin' ? 'pinyin' : exercise.rubric.id === 'typed-characters' ? 'characters' : 'gloss';

/** The text of the first typed answer, or null after "No lo sé". */
export const typedText = (actions: readonly AttemptAction[]): string | null => {
  for (const action of actions) if (action.type === 'answer' && action.answer !== null) return action.answer;
  return null;
};

/**
 * Typed pinyin with tone digits shown with marks, for the preview under the field: "ni3hao3"
 * reads "nǐhǎo". Text without digits comes back as it was.
 */
export const pinyinPreview = (text: string): string =>
  text.replace(/(?:[a-zü]|u:)+[0-5]/gi, (syllable) => markTones(syllable.toLowerCase().replace(/0$/, '5')));

const TONE_NAME: Record<Tone, string> = { 1: 'tono 1', 2: 'tono 2', 3: 'tono 3', 4: 'tono 4', 5: 'tono neutro' };
const toneName = (tone: Tone | null) => (tone === null ? 'dos tonos distintos' : TONE_NAME[tone]);

const ordinalList = (positions: readonly number[]) => {
  const numbers = positions.map((position) => String(position + 1));
  return numbers.length === 1 ? numbers[0] : `${numbers.slice(0, -1).join(', ')} y ${numbers[numbers.length - 1]}`;
};

const count = (n: number, one: string, many: string) => (n === 1 ? `un ${one}` : `${n} ${many}`);

const pinyinLines = (grade: Extract<TypedGrade, { kind: 'pinyin' }>, tonesCount: boolean): { summary: string | null; lines: string[] } => {
  const { syllableErrors, toneErrors } = grade.diagnosis;
  const lines = [
    ...syllableErrors.map((error) => {
      if (error.kind === 'missing') return `Falta la sílaba ${error.expected}.`;
      if (error.kind === 'extra') return `Sobra «${error.given}».`;
      return `En la sílaba ${error.position + 1} escribiste «${error.given}» y es ${error.expected}.`;
    }),
    ...toneErrors.map((error) => {
      const others = error.accepted.filter((tone) => tone !== error.expected);
      const sandhi = others.length > 0 ? `, o ${others.map((tone) => TONE_NAME[tone]).join(' o ')} por sandhi` : '';
      return `En ${error.syllable} escribiste ${toneName(error.given)} y lleva ${TONE_NAME[error.expected]}${sandhi}.`;
    }),
  ];
  let summary: string | null = null;
  if (syllableErrors.length > 0 && toneErrors.length > 0) summary = 'Fallan sílabas y tonos.';
  else if (syllableErrors.length > 0) summary = 'Hay sílabas que no coinciden.';
  else if (toneErrors.length > 0) summary = tonesCount ? 'Las sílabas están bien. Fallan los tonos.' : 'Las sílabas están bien. Aquí los tonos no cuentan, pero revísalos.';
  return { summary, lines };
};

export interface TypedReport {
  /** What the learner typed, pinyin with its digits shown as marks. Null after "No lo sé". */
  given: string | null;
  /** One sentence on what went wrong: syllables, tones, characters or meaning. */
  summary: string | null;
  lines: string[];
}

/**
 * What the feedback says about a typed answer, from the diagnosis `gradeTypedAnswer` gives for the
 * recorded text. The controller already decided the result; this only explains it.
 */
export const typedReport = (exercise: Exercise, actions: readonly AttemptAction[]): TypedReport => {
  const text = typedText(actions);
  if (text === null) return { given: null, summary: null, lines: [] };
  const grade = gradeTypedAnswer(exercise, text);
  if (!grade) return { given: text, summary: null, lines: [] };
  const target = exercise.accepted?.[0]?.id ?? null;
  const other = grade.diagnosis.contentId !== null && target !== null && grade.diagnosis.contentId !== target;
  const correct = grade.evaluation.outcome === 'correct';
  const otherLine = 'Escribiste otra palabra que también encaja, así que vale.';

  if (grade.kind === 'pinyin') {
    const { summary, lines } = pinyinLines(grade, exercise.skill === 'tones');
    return { given: pinyinPreview(text), summary, lines: correct && other ? [otherLine, ...lines] : lines };
  }
  if (grade.kind === 'characters') {
    if (correct) return { given: text, summary: null, lines: other ? ['Escribiste otra palabra que suena igual, así que vale.'] : [] };
    const typed = [...text.replace(/\s+/gu, '')].length;
    const wrong = grade.diagnosis.wrongPositions.filter((position) => position < typed);
    const lines: string[] = [];
    if (wrong.length > 0) lines.push(wrong.length === 1 ? `Falla el carácter ${ordinalList(wrong)}.` : `Fallan los caracteres ${ordinalList(wrong)}.`);
    const extra = grade.diagnosis.lengthDifference;
    if (extra > 0) lines.push(`${extra === 1 ? 'Sobra' : 'Sobran'} ${count(extra, 'carácter', 'caracteres')}.`);
    if (extra < 0) lines.push(`${extra === -1 ? 'Falta' : 'Faltan'} ${count(-extra, 'carácter', 'caracteres')}.`);
    return { given: text, summary: null, lines };
  }
  if (correct) return { given: text, summary: null, lines: other ? [otherLine] : [] };
  const glosses = exercise.accepted?.[0]?.glosses.slice(0, 3) ?? [];
  return {
    given: text,
    summary: 'Ese significado no está entre los de esta palabra.',
    lines: glosses.length > 0 ? [`Valen ${glosses.map((gloss) => `«${gloss}»`).join(', ')}.`] : [],
  };
};
