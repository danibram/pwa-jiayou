import { fold } from '../exercises/ambiguity';
import type { Evaluation } from '../types';

/**
 * Names the rules for typed characters and typed glosses in this file. Exercises that grade with
 * them store it as their rubric revision. Bump it when the same input would get another result.
 */
export const TYPED_ANSWER_POLICY_VERSION = 'typed-answer-policy@1';

export type { AcceptedAnswer } from '../types';
import type { AcceptedAnswer } from '../types';

export interface CharactersDiagnosis {
  policyVersion: typeof TYPED_ANSWER_POLICY_VERSION;
  /** The entry matched, or the one compared with when none matched. Null on format errors. */
  contentId: string | null;
  /** Positions whose character differs from that entry's simplified form. */
  wrongPositions: readonly number[];
  /** Characters typed minus characters expected. */
  lengthDifference: number;
  /** Characters that are not hanzi, with their index in the input. */
  formatErrors: readonly { kind: 'not-hanzi'; character: string; at: number }[];
}

export interface GlossDiagnosis {
  policyVersion: typeof TYPED_ANSWER_POLICY_VERSION;
  /** The entry whose sense matched. Null when none did. */
  contentId: string | null;
  /** The sense whose text, or a part of it, matched. */
  matched: string | null;
}

const HAN = /\p{Script=Han}/u;
const SPACE = /\s/u;

/**
 * Typed characters. Spaces are ignored; anything that is not a hanzi is a format error, so pinyin
 * typed into a character field is `invalid` and never `incorrect`. The answer is correct when it
 * equals the simplified or the traditional form of an accepted entry.
 */
export const evaluateCharactersAnswer = (
  input: string,
  accepted: readonly AcceptedAnswer[],
): { evaluation: Evaluation; diagnosis: CharactersDiagnosis } => {
  if (accepted.length === 0) throw new Error('No accepted entry to check the answer against');
  const text = input.normalize('NFC');
  const formatErrors: { kind: 'not-hanzi'; character: string; at: number }[] = [];
  const typed: string[] = [];
  let at = 0;
  for (const character of text) {
    if (HAN.test(character)) typed.push(character);
    else if (!SPACE.test(character)) formatErrors.push({ kind: 'not-hanzi', character, at });
    at += character.length;
  }
  const base = { policyVersion: TYPED_ANSWER_POLICY_VERSION, wrongPositions: [], lengthDifference: 0 } as const;
  if (formatErrors.length > 0) {
    return { evaluation: { outcome: 'invalid', reason: 'other' }, diagnosis: { ...base, contentId: null, formatErrors } };
  }
  if (typed.length === 0) return { evaluation: { outcome: 'unanswered' }, diagnosis: { ...base, contentId: null, formatErrors } };

  const answer = typed.join('');
  const match = accepted.find((entry) =>
    [entry.simplified, entry.traditional].some((form) => form.normalize('NFC').replace(/\s+/gu, '') === answer),
  );
  if (match) return { evaluation: { outcome: 'correct' }, diagnosis: { ...base, contentId: match.id, formatErrors } };

  // Compared with the entry that shares most characters in place; the first on a tie.
  let closest = accepted[0];
  let closestWrong: number[] = [];
  let closestScore = -1;
  for (const entry of accepted) {
    const expected = [...entry.simplified.normalize('NFC').replace(/\s+/gu, '')];
    const wrong = expected.flatMap((character, i) => (typed[i] === character ? [] : [i]));
    const score = expected.length - wrong.length;
    if (score > closestScore) {
      closest = entry;
      closestWrong = wrong;
      closestScore = score;
    }
  }
  return {
    evaluation: { outcome: 'incorrect' },
    diagnosis: {
      ...base,
      contentId: closest.id,
      wrongPositions: closestWrong,
      lengthDifference: typed.length - [...closest.simplified.trim()].length,
      formatErrors,
    },
  };
};

/** Trailing and leading punctuation a sentence may carry. */
const EDGE_PUNCTUATION = /^[\s.,;:!?¡¿"'«»()]+|[\s.,;:!?¡¿"'«»()]+$/gu;

/**
 * What a sense accepts: the whole text, the text without parentheses, and each part between commas,
 * semicolons or a slash with spaces around it. "seguro/a, confiable" accepts "seguro/a, confiable",
 * "seguro/a" and "confiable"; "niño/a" accepts only "niño/a".
 */
export const glossForms = (gloss: string): string[] => {
  const forms = new Set<string>();
  const add = (text: string) => {
    const folded = fold(text.replace(EDGE_PUNCTUATION, ''));
    if (folded) forms.add(folded);
  };
  for (const text of [gloss, gloss.replace(/\([^)]*\)/gu, ' ')]) {
    add(text);
    for (const part of text.split(/\s*[,;]\s*|\s+\/\s+/u)) add(part);
  }
  return [...forms];
};

/**
 * A typed gloss. Case, accents, repeated spaces and punctuation at the edges do not count. The
 * answer is correct when it equals one of the `glossForms` of a sense of an accepted entry. A
 * synonym the catalog does not list is incorrect. The rule only knows the catalog's senses, which
 * is why exercises graded this way stay practice.
 */
export const evaluateGlossAnswer = (
  input: string,
  accepted: readonly AcceptedAnswer[],
): { evaluation: Evaluation; diagnosis: GlossDiagnosis } => {
  if (accepted.length === 0) throw new Error('No accepted entry to check the answer against');
  const answer = fold(input.replace(EDGE_PUNCTUATION, ''));
  const base = { policyVersion: TYPED_ANSWER_POLICY_VERSION } as const;
  if (answer === '') return { evaluation: { outcome: 'unanswered' }, diagnosis: { ...base, contentId: null, matched: null } };
  for (const entry of accepted) {
    for (const gloss of entry.glosses) {
      if (glossForms(gloss).includes(answer)) {
        return { evaluation: { outcome: 'correct' }, diagnosis: { ...base, contentId: entry.id, matched: gloss } };
      }
    }
  }
  return { evaluation: { outcome: 'incorrect' }, diagnosis: { ...base, contentId: null, matched: null } };
};
