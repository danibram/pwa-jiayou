import { fold, sharesSense, soundsSame } from './ambiguity';
import { shuffleWith } from './random';
import type { WordEntry } from './types';

export interface ChoiceOption {
  id: string;
  text: string;
  contentId: string;
}

export interface OptionRequest {
  target: WordEntry;
  vocabulary: readonly WordEntry[];
  /** What each option shows: the characters, or the gloss. */
  text: (word: WordEntry) => string;
  /** The cue is audio, so no option may sound like the target. */
  audio: boolean;
  familiar?: (contentId: string) => boolean;
  random: () => number;
}

/** At least this many distractors, so a multiple-choice card has three or four options. */
export const MIN_DISTRACTORS = 2;
export const MAX_DISTRACTORS = 3;

const levelRank = (word: WordEntry) => word.level ?? 7;
const length = (word: WordEntry) => [...word.simplified.trim()].length;

/**
 * Whether two options could both be right, or look the same. Applies to every pair in a set:
 * - the same characters (还 hái and 还 huán);
 * - a shared sense (喜欢 and 爱 for "querer", 高兴 and 快乐 for "feliz");
 * - the same text on the button;
 * - with an audio cue, the same sound (他 and 她, 的, 地 and 得).
 */
const clashByContent = (a: WordEntry, b: WordEntry, request: OptionRequest): boolean =>
  a.simplified.trim() === b.simplified.trim() || sharesSense(a, b) || (request.audio && soundsSame(a, b));
const clash = (a: WordEntry, b: WordEntry, request: OptionRequest): boolean =>
  clashByContent(a, b, request) || fold(request.text(a)) === fold(request.text(b));

/**
 * The target and two or three distractors, shuffled, or null when fewer than two distractors fit.
 * Distractors are close neighbours, as in `pickChoices`: met words first, then the same topic,
 * length and level. With two or more met words available, only met words are offered, because an
 * unseen glyph is ruled out by its strangeness alone.
 */
export const buildOptions = (request: OptionRequest): ChoiceOption[] | null => {
  const { target, vocabulary, familiar = () => false, random } = request;
  // The cached content checks run on the whole vocabulary; the option text is compared only while picking.
  const candidates = vocabulary.filter((word) => word.id !== target.id && !clashByContent(target, word, request));
  const topics = new Set(target.topicIds ?? []);
  const closeness = (word: WordEntry) =>
    (familiar(word.id) ? 10 : 0) +
    ((word.topicIds ?? []).some((id) => topics.has(id)) ? 3 : 0) +
    (length(word) === length(target) ? 2 : 0) +
    (levelRank(word) === levelRank(target) ? 1 : Math.abs(levelRank(word) - levelRank(target)) === 1 ? 0.5 : 0);
  // The shuffle comes first, so the stable sort breaks ties by the seed.
  const ranked = shuffleWith(candidates, random)
    .map((word) => ({ word, score: closeness(word) }))
    .sort((a, b) => b.score - a.score)
    .map(({ word }) => word);

  const pick = (onlyMet: boolean): WordEntry[] => {
    const picked: WordEntry[] = [];
    for (const word of ranked) {
      if (picked.length === MAX_DISTRACTORS) break;
      if (onlyMet && !familiar(word.id)) continue;
      if ([target, ...picked].some((other) => clash(other, word, request))) continue;
      picked.push(word);
    }
    return picked;
  };
  const metCount = new Set(ranked.filter((word) => familiar(word.id)).map((word) => word.simplified)).size;
  let picked = metCount >= MIN_DISTRACTORS ? pick(true) : [];
  if (picked.length < MIN_DISTRACTORS) picked = pick(false);
  if (picked.length < MIN_DISTRACTORS) return null;
  return shuffleWith([target, ...picked], random).map((word, index) => ({
    id: `option-${index + 1}`,
    text: request.text(word),
    contentId: word.id,
  }));
};
