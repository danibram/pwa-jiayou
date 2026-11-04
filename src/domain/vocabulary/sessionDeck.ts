import { catalogWords, type VocabularyEntry } from '../../data/vocabulary';
import { leadSense } from '../../data/wordSenses';
import { levelRank } from '../../utils/wordOrder';
import { shuffle } from '../../utils/shuffle';
import type { Prompt } from '../../utils/vocabularySession';

export type DeckCard = { entry: VocabularyEntry; kind: 'learn' | 'review' | 'recall'; prompt?: Prompt };
const GROUP = 3;

const groupsOf = (fresh: VocabularyEntry[]): VocabularyEntry[][] => {
  const count = Math.max(1, Math.round(fresh.length / GROUP));
  return Array.from({ length: count }, (_, index) =>
    fresh.slice(Math.round((index * fresh.length) / count), Math.round(((index + 1) * fresh.length) / count)));
};

/**
 * The words in a new order, so the place in the row gives nothing away. Never opening on the word
 * just shown, and from three words up never in the order they were taught.
 */
export const askOrder = <T,>(words: T[]): T[] => {
  const same = (order: T[]) => order[0] === words[words.length - 1] || (words.length > 2 && order.every((word, index) => word === words[index]));
  let order = shuffle(words);
  for (let tries = 0; tries < 20 && words.length > 1 && same(order); tries++) order = shuffle(words);
  return order;
};

/**
 * Reviews and new words woven together: a few reviews, then three new words and their recall, and again.
 * Nothing is front-loaded, so a long session never opens with twenty introductions.
 */
/**
 * Particles and classifiers have no meaning to say on their own ("partícula posesiva"), so their
 * first recall shows the word and asks what it does, instead of asking for it from the Spanish.
 */
/** Judged on the first use: a particle or a classifier teaches grammar, not a meaning to recall. */
export const isFunctionWord = (entry: VocabularyEntry): boolean => {
  const [first] = entry.senses;
  return first?.pos === 'partícula' || first?.pos === 'clasificador' || /part[ií]cula|clasificador/i.test(first?.text ?? '');
};

export const interleave = (reviews: DeckCard[], fresh: VocabularyEntry[]): DeckCard[] => {
  const out: DeckCard[] = [];
  const groups = fresh.length ? groupsOf(fresh) : [];
  let r = 0;
  let previous: VocabularyEntry[] = [];
  for (let g = 0; g < groups.length || r < reviews.length; g++) {
    out.push(...reviews.slice(r, r + GROUP));
    r += GROUP;
    const group = groups[g] ?? [];
    out.push(...group.map((entry) => ({ entry, kind: 'learn' as const })));
    // The first recall is production: the Spanish, and the word to pick out of four.
    out.push(...askOrder(group).map((entry) => ({ entry, kind: 'recall' as const, prompt: isFunctionWord(entry) ? 'recognize' as const : 'pick' as const })));
    // The group before comes back as recognition once a new group has pushed it out of mind:
    // the word, and its meaning to pick, so a first-day answer is checked rather than self-graded.
    out.push(...askOrder(previous).map((entry) => ({ entry, kind: 'recall' as const, prompt: 'recognize' as const })));
    previous = group;
  }
  out.push(...askOrder(previous).map((entry) => ({ entry, kind: 'recall' as const, prompt: 'recognize' as const })));
  return out;
};

const senses = (entry: VocabularyEntry) => entry.senses.map((sense) => sense.text);
const firstSense = (entry: VocabularyEntry) => (senses(entry)[0] ?? '').toLowerCase();
const sharesSense = (entry: VocabularyEntry, sense: string) => senses(entry).some((part) => part.toLowerCase() === sense);

/**
 * The Spanish a production card asks from. When another word up to this level answers to the same first
 * sense («leer» is 读 and 阅读), the second sense comes along, or the length when there is none,
 * so the learner knows which word is meant.
 */
export const askGloss = (entry: VocabularyEntry): { text: string; hint?: string } => {
  const [first = leadSense(entry.senses), second] = senses(entry);
  const sense = first.toLowerCase();
  const clash = catalogWords().some((other) => other.simplified !== entry.simplified && other.level <= Math.max(levelRank(entry), 3) && sharesSense(other, sense));
  if (!clash) return { text: first };
  if (second) return { text: `${first}, ${second}` };
  return { text: first, hint: entry.characters.length === 1 ? 'Un carácter' : `${entry.characters.length} caracteres` };
};

/**
 * The target and three other words to pick from, never one that shares the target's first sense,
 * so only one answer is right. Words the learner has met come first: among unseen glyphs the one
 * just taught is the only familiar shape. Then close neighbours: same topic, same length, same level,
 * so the wrong ones are tempting and the pick tests the word, not a guess by shape.
 */
export const pickChoices = (target: VocabularyEntry, pool: VocabularyEntry[], met: (entry: VocabularyEntry) => boolean = () => false): VocabularyEntry[] => {
  const source = pool.length >= 8 ? pool : catalogWords();
  const sense = firstSense(target);
  const fits = (entry: VocabularyEntry) =>
    entry.id !== target.id && entry.simplified !== target.simplified && firstSense(entry) !== sense && !sharesSense(entry, sense);
  const topics = new Set(target.topicIds ?? []);
  const closeness = (entry: VocabularyEntry) =>
    (met(entry) ? 10 : 0) +
    ((entry.topicIds ?? []).some((id) => topics.has(id)) ? 3 : 0) +
    (entry.characters.length === target.characters.length ? 2 : 0) +
    (levelRank(entry) === levelRank(target) ? 1 : Math.abs(levelRank(entry) - levelRank(target)) === 1 ? 0.5 : 0);
  const ranked = shuffle(source.filter(fits)).map((entry) => ({ entry, score: closeness(entry) })).sort((a, b) => b.score - a.score);
  const picked = new Map<string, VocabularyEntry>();
  // Early on, an unseen word is ruled out by its strangeness alone. With two met words to offer,
  // three options beat four that include a stranger.
  const metCount = new Set(ranked.filter(({ entry }) => met(entry)).map(({ entry }) => entry.simplified)).size;
  const limit = metCount >= 2 ? Math.min(3, metCount) : 3;
  for (const { entry } of ranked) {
    if (picked.size === limit) break;
    if (metCount >= 2 && !met(entry)) continue;
    if (!picked.has(entry.simplified)) picked.set(entry.simplified, entry);
  }
  return shuffle([target, ...picked.values()]);
};

