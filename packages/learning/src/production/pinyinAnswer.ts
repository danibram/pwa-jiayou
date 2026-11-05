import { withToneSandhi, type Tone } from '@jiayou/chinese';
import type { Evaluation } from '../types';
import {
  PINYIN_POLICY_VERSION,
  parsePinyinInput,
  syllableBase,
  type PinyinFormatError,
  type PinyinLetter,
  type PinyinToken,
} from './pinyinInput';

/** The entry fields a pinyin answer is checked against. Catalog words and accepted answers fit. */
export interface PinyinTarget {
  id: string;
  simplified: string;
  /** The catalog reading, dictionary or sandhi form: both give the same accepted tones. */
  pinyin: string;
}

/**
 * `required`: a wrong or missing tone makes the answer incorrect (skill `tones`).
 * `reported`: tones are diagnosed but only the syllables decide (skill `production`).
 */
export type TonePolicy = 'required' | 'reported';

/** One syllable of the expected reading. */
export interface ExpectedSyllable {
  /** As the catalog writes it, lowercased: "hǎo", "ǹg". */
  text: string;
  base: string;
  /** The tone in the catalog reading. */
  tone: Tone;
  /** Every tone the policy accepts here, ascending. Always includes `tone`. */
  accepted: readonly Tone[];
}

/** One syllable as the learner typed it, after splitting against the expected reading. */
export interface GivenSyllable {
  base: string;
  /** Null when the syllable carries two different tones ("mā5", "nǐ" with a 4 after it). */
  tone: Tone | null;
}

export type SyllableError =
  /** A syllable typed in place of the expected one, with other letters. */
  | { kind: 'wrong'; position: number; expected: string; given: string }
  /** An expected syllable with nothing typed for it. */
  | { kind: 'missing'; position: number; expected: string; given: null }
  /** A typed syllable the reading does not have. `position` is the expected syllable it follows. */
  | { kind: 'extra'; position: number; expected: null; given: string };

export interface ToneError {
  /** Index in the expected reading. */
  position: number;
  syllable: string;
  expected: Tone;
  accepted: readonly Tone[];
  given: Tone | null;
}

export interface PinyinDiagnosis {
  policyVersion: typeof PINYIN_POLICY_VERSION;
  /** The entry the answer was compared with: the matching one, or the closest. Null on format errors. */
  contentId: string | null;
  expected: readonly ExpectedSyllable[];
  given: readonly GivenSyllable[];
  syllableErrors: readonly SyllableError[];
  /** Only for syllables typed with the right letters. */
  toneErrors: readonly ToneError[];
  /** Input the policy cannot read. When present, nothing else is diagnosed. */
  formatErrors: readonly PinyinFormatError[];
}

export interface PinyinResult {
  evaluation: Evaluation;
  diagnosis: PinyinDiagnosis;
}

const toneOfLetters = (letters: readonly PinyinLetter[]): Tone =>
  letters.find((letter) => letter.mark !== null)?.mark ?? 5;

const readingCache = new Map<string, readonly ExpectedSyllable[]>();

/**
 * The expected syllables and the tones each accepts. Spoken tone sandhi is accepted next to the
 * dictionary tone, syllable by syllable:
 * - every tone `withToneSandhi` gives (一 yí before a fourth tone, yì before the others, 不 bú
 *   before a fourth tone), so the reading the card shows is right;
 * - 一 also accepts tone 1 and 不 tone 4, so the dictionary reading is right too, whichever of the
 *   two forms the entry carries;
 * - a third tone right before another third tone also accepts tone 2 (你好 ní hǎo). In a run of
 *   three or more, every third tone but the last accepts 2, whatever the grouping.
 * 一 and 不 only count when the reading has one syllable per character; erhua readings such as
 * 一点儿 yī diǎnr keep their catalog tones. Everything else accepts only its catalog tone, and a
 * neutral tone stays neutral: 爸爸 accepts "ba4 ba5" and not "ba4 ba4".
 *
 * Throws when the catalog reading itself is not readable pinyin, because that is a content error.
 */
export const expectedReading = (target: Pick<PinyinTarget, 'simplified' | 'pinyin'>): readonly ExpectedSyllable[] => {
  const simplified = target.simplified.normalize('NFC').trim();
  const pinyin = target.pinyin.normalize('NFC').trim().replace(/\s+/g, ' ');
  const key = `${simplified}\u0000${pinyin}`;
  const cached = readingCache.get(key);
  if (cached) return cached;

  const syllables = (reading: string): PinyinToken[] => {
    const parsed = parsePinyinInput(reading);
    if (parsed.kind !== 'tokens' || parsed.tokens.some((token) => token.digit !== null)) {
      throw new Error(`Reading "${reading}" of ${simplified} is not marked pinyin`);
    }
    return [...parsed.tokens];
  };
  const dictionary = syllables(pinyin);
  const spoken = syllables(withToneSandhi(simplified, pinyin));
  const characters = [...simplified];
  const aligned = characters.length === dictionary.length;
  const tones = dictionary.map((token) => toneOfLetters(token.letters));

  const reading = dictionary.map((token, i): ExpectedSyllable => {
    const tone = tones[i];
    const accepted = new Set<Tone>([tone]);
    if (spoken.length === dictionary.length) accepted.add(toneOfLetters(spoken[i].letters));
    if (aligned && characters[i] === '一' && syllableBase(token.letters) === 'yi') accepted.add(1);
    if (aligned && characters[i] === '不' && syllableBase(token.letters) === 'bu') accepted.add(4);
    if (tone === 3 && tones[i + 1] === 3) accepted.add(2);
    const text = pinyin.split(' ')[i].toLowerCase();
    return { text, base: syllableBase(token.letters), tone, accepted: [...accepted].sort((a, b) => a - b) };
  });
  readingCache.set(key, reading);
  return reading;
};

interface TypedSyllable extends GivenSyllable {
  letters: readonly PinyinLetter[];
}

/** The tone a syllable carries: its mark or its digit, neutral with neither, null when they disagree. */
const typedTone = (letters: readonly PinyinLetter[], digit: Tone | null): Tone | null => {
  const tones = new Set<Tone>();
  for (const letter of letters) if (letter.mark !== null) tones.add(letter.mark);
  if (digit !== null) tones.add(digit);
  if (tones.size > 1) return null;
  return tones.size === 1 ? [...tones][0] : 5;
};

/**
 * Splits each token into syllables guided by the expected reading. While the token starts with
 * the next expected syllable and has letters left after it, that prefix is a syllable; the rest of
 * the token is one more syllable. "nihao" against nǐ hǎo is ni + hao, "nihoa" is ni + hoa, and
 * "xian" against 西安 xī ān is xi + an. A digit belongs to the token's last syllable.
 */
const splitTokens = (tokens: readonly PinyinToken[], expected: readonly ExpectedSyllable[]): TypedSyllable[] => {
  const out: TypedSyllable[] = [];
  let next = 0;
  for (const token of tokens) {
    let start = 0;
    const pieces: PinyinLetter[][] = [];
    while (start < token.letters.length) {
      const want = expected[next];
      const end = want ? start + [...want.base].length : -1;
      if (want && end < token.letters.length && syllableBase(token.letters.slice(start, end)) === want.base) {
        pieces.push(token.letters.slice(start, end));
        start = end;
      } else {
        pieces.push(token.letters.slice(start));
        start = token.letters.length;
      }
      next++;
    }
    pieces.forEach((letters, i) => {
      const digit = i === pieces.length - 1 ? token.digit : null;
      out.push({ letters, base: syllableBase(letters), tone: typedTone(letters, digit) });
    });
  }
  return out;
};

type Step = { op: 'pair'; expected: number; given: number } | { op: 'missing'; expected: number } | { op: 'extra'; given: number; after: number };

/** Edit-distance alignment of syllable bases. Ties prefer pairing, then a missing syllable. */
const align = (expected: readonly string[], given: readonly string[]): Step[] => {
  const rows = expected.length + 1;
  const cols = given.length + 1;
  const cost: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const pair = cost[i - 1][j - 1] + (expected[i - 1] === given[j - 1] ? 0 : 1);
      cost[i][j] = Math.min(pair, cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    }
  }
  const steps: Step[] = [];
  let i = expected.length;
  let j = given.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (expected[i - 1] === given[j - 1] ? 0 : 1)) {
      steps.push({ op: 'pair', expected: --i, given: --j });
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      steps.push({ op: 'missing', expected: --i });
    } else {
      steps.push({ op: 'extra', given: --j, after: i - 1 });
    }
  }
  return steps.reverse();
};

const formatResult = (errors: readonly PinyinFormatError[]): PinyinResult => ({
  // An answer the policy cannot read says nothing about what the learner knows.
  evaluation: { outcome: 'invalid', reason: 'other' },
  diagnosis: {
    policyVersion: PINYIN_POLICY_VERSION,
    contentId: null,
    expected: [],
    given: [],
    syllableErrors: [],
    toneErrors: [],
    formatErrors: errors,
  },
});

const diagnose = (tokens: readonly PinyinToken[], target: PinyinTarget, tones: TonePolicy): PinyinResult => {
  const expected = expectedReading(target);
  const typed = splitTokens(tokens, expected);
  const syllableErrors: SyllableError[] = [];
  const toneErrors: ToneError[] = [];
  for (const step of align(expected.map((s) => s.base), typed.map((s) => s.base))) {
    if (step.op === 'missing') {
      syllableErrors.push({ kind: 'missing', position: step.expected, expected: expected[step.expected].text, given: null });
    } else if (step.op === 'extra') {
      syllableErrors.push({ kind: 'extra', position: step.after, expected: null, given: typed[step.given].base });
    } else {
      const want = expected[step.expected];
      const got = typed[step.given];
      if (want.base !== got.base) {
        syllableErrors.push({ kind: 'wrong', position: step.expected, expected: want.text, given: got.base });
      } else if (got.tone === null || !want.accepted.includes(got.tone)) {
        toneErrors.push({ position: step.expected, syllable: want.text, expected: want.tone, accepted: want.accepted, given: got.tone });
      }
    }
  }
  const correct = syllableErrors.length === 0 && (tones === 'reported' || toneErrors.length === 0);
  return {
    evaluation: { outcome: correct ? 'correct' : 'incorrect' },
    diagnosis: {
      policyVersion: PINYIN_POLICY_VERSION,
      contentId: target.id,
      expected,
      given: typed.map(({ base, tone }) => ({ base, tone })),
      syllableErrors,
      toneErrors,
      formatErrors: [],
    },
  };
};

const EMPTY: PinyinResult = {
  evaluation: { outcome: 'unanswered' },
  diagnosis: {
    policyVersion: PINYIN_POLICY_VERSION,
    contentId: null,
    expected: [],
    given: [],
    syllableErrors: [],
    toneErrors: [],
    formatErrors: [],
  },
};

/**
 * Checks typed pinyin against one entry under `PINYIN_POLICY_VERSION`. Empty input is
 * `unanswered`; unreadable input is `invalid` with format errors and never `incorrect`; otherwise
 * the answer is `correct` or `incorrect` and the diagnosis lists syllable and tone errors apart.
 * Tones omitted everywhere read as neutral tones, so "ni hao" for 你好 has two tone errors.
 */
export const evaluatePinyinAnswer = (input: string, entry: PinyinTarget, tones: TonePolicy = 'required'): PinyinResult =>
  evaluatePinyinAgainst(input, [entry], tones);

/**
 * Checks typed pinyin against several accepted entries. The first entry the answer matches wins;
 * when none does, the diagnosis is against the closest, counting a syllable error as two tone
 * errors, and the earlier entry on a tie.
 */
export const evaluatePinyinAgainst = (input: string, entries: readonly PinyinTarget[], tones: TonePolicy = 'required'): PinyinResult => {
  if (entries.length === 0) throw new Error('No accepted entry to check the answer against');
  const parsed = parsePinyinInput(input);
  if (parsed.kind === 'empty') return EMPTY;
  if (parsed.kind === 'format-error') return formatResult(parsed.errors);
  let best: PinyinResult | null = null;
  let bestScore = Infinity;
  for (const entry of entries) {
    const result = diagnose(parsed.tokens, entry, tones);
    if (result.evaluation.outcome === 'correct') return result;
    const score = result.diagnosis.syllableErrors.length * 2 + result.diagnosis.toneErrors.length;
    if (score < bestScore) {
      best = result;
      bestScore = score;
    }
  }
  return best!;
};
