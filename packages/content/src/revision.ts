/** An immutable revision of one published word or character. */
export interface ContentReference {
  contentId: string;
  contentRevision: string;
}
import { withToneSandhi } from '@jiayou/chinese';

// Per-entry content revisions. Publishing (scripts/content-publish.mjs) writes the same values to
// src/data/vocabulary/published-ids.json, and tests/vocabularyData.test.ts checks they match.
// A revision hashes a versioned canonical form that holds only what a question shows or grades.
// Changing what goes into a form means a new prefix (w2, c2), never an edit to w1 or c1:
// attempts already saved keep pointing at the old revisions.

/** The word fields a revision reads. Raw catalog rows and parsed VocabularyEntry objects both fit. */
export interface WordContent {
  id: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  senses: readonly { pos?: string; text: string; note?: string }[];
}

/** The character fields a revision reads: an HSKCharacter after its gloss sidecar has been merged. */
export interface CharacterContent {
  character: string;
  pinyin: string;
  definition: string;
  gloss?: string;
  example?: { es: string };
}

export const WORD_FORM = 'w1';
export const CHARACTER_FORM = 'c1';

const clean = (value: string) => value.normalize('NFC').trim();
/** Readings compare by syllables, so runs of spaces are one separator. */
const reading = (value: string) => clean(value).replace(/\s+/g, ' ');
const optional = (value: string | undefined) => (value === undefined ? null : clean(value));

/**
 * The w1 form holds what a word card shows or uses to pick its question:
 * - simplified and traditional (the card shows the traditional form when it differs);
 * - the reading a card shows;
 * - the first sense's part of speech, because `isFunctionWord` turns the recall of a particle or
 *   classifier around;
 * - the first sense's note, which `displayGloss` shows when the first sense is only the pinyin;
 * - every sense text in order: the first leads the card, the rest are the line below it, and
 *   askGloss adds the second when another word shares the first.
 * Later senses' parts of speech and notes appear only on the word page, so they are left out, as are
 * the id, level, topics, source, characters, relations and example.
 */
export const canonicalWord = (word: WordContent): string => {
  const simplified = clean(word.simplified);
  const [first] = word.senses;
  return `${WORD_FORM}:${JSON.stringify([
    simplified,
    clean(word.traditional),
    // Raw rows carry the dictionary reading and parsed entries the sandhi one; both end up as the latter.
    reading(withToneSandhi(simplified, reading(word.pinyin))),
    first?.pos ?? null,
    optional(first?.note),
    word.senses.map((sense) => clean(sense.text)),
  ])}`;
};

/**
 * The c1 form holds what spokenMeaning reads to build the stroke page's prompt: the reading, the
 * gloss, the definition (its first sense stands in when there is no gloss) and the example's Spanish.
 * The prompt shows nothing else. Level, radical, stroke count, frequency, the traditional form and
 * the example's word and reading are left out. Stroke geometry grades the drawing but loads
 * asynchronously from files, so c1 does not cover it yet.
 */
export const canonicalCharacter = (character: CharacterContent): string =>
  `${CHARACTER_FORM}:${JSON.stringify([
    clean(character.character),
    reading(character.pinyin),
    clean(character.definition),
    optional(character.gloss),
    optional(character.example?.es),
  ])}`;

/**
 * 64-bit hash over UTF-16 code units: two 32-bit lanes, each mixed after every code unit with a
 * multiply and xor-shift so high bits reach low bits before the next unit, the second lane also
 * taking in the first. A cyrb53-style finalizer mixes them at the end. Only Math.imul and integer
 * shifts, so it is synchronous and identical in Node and every browser. It identifies content; it
 * is not a security boundary. ConfigId uses SHA-256 on purpose: configs are hashed rarely and can
 * wait for crypto.subtle, while revisions are needed synchronously for every entry.
 */
export const hash64 = (text: string): string => {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x85ebca6b);
    h1 ^= h1 >>> 15;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 13;
    h2 = Math.imul(h2 ^ code, 0x27d4eb2f);
    h2 ^= h2 >>> 16;
    h2 = Math.imul(h2, 0x165667b1);
    h2 ^= (h2 >>> 13) ^ h1;
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
};

/** "w1:" or "c1:" followed by 16 hex digits. The prefix names the canonical form. */
const revisionOf = (canonical: string) => `${canonical.slice(0, canonical.indexOf(':'))}:${hash64(canonical)}`;

export const wordRevision = (word: WordContent): string => revisionOf(canonicalWord(word));
export const characterRevision = (character: CharacterContent): string => revisionOf(canonicalCharacter(character));

/** "char-" and the code point in hex, the same spelling wordId uses for hanzi. */
export const characterContentId = (character: string): string => {
  const chars = [...clean(character)];
  if (chars.length !== 1) throw new Error(`Se esperaba un carácter: ${character}`);
  return `char-${chars[0].codePointAt(0)!.toString(16)}`;
};

export const contentReferenceForWord = (word: WordContent): ContentReference => {
  if (!word.id) throw new Error(`Palabra sin id: ${word.simplified}`);
  return { contentId: word.id, contentRevision: wordRevision(word) };
};

export const contentReferenceForCharacter = (character: CharacterContent): ContentReference => ({
  contentId: characterContentId(character.character),
  contentRevision: characterRevision(character),
});
