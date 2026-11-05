import { describe, expect, it } from 'vitest';
import {
  PINYIN_POLICY_VERSION,
  evaluatePinyinAgainst,
  evaluatePinyinAnswer,
  expectedReading,
  parsePinyinInput,
  type PinyinTarget,
} from '../../../src/domain/learning/production';
import { word } from '../exercises/fixtures';

const nihao = word('word-4f60-597d-ni3-hao3');
const nuer = word('word-5973-513f-nv3-er2');
const lv = word('word-7eff-lv4');
const yiding = word('word-4e00-5b9a-yi-ding4');
const bukeqi = word('word-4e0d-5ba2-6c14-bu4-ke4-qi5');
const baba = word('word-7238-7238-ba4-ba5');
const ng = word('word-55ef-ng4');
const hai = word('word-8fd8-hai2');
const huan = word('word-8fd8-huan2');
const laohu = word('word-8001-864e-lao3-hu3');
/** 女 alone is not in the catalog; a learner's custom word carries it. */
const nv: PinyinTarget = { id: 'custom-5973-nv3', simplified: '女', pinyin: 'nǚ' };

const outcome = (input: string, target: PinyinTarget) => evaluatePinyinAnswer(input, target).evaluation.outcome;

const accepts = (target: PinyinTarget, inputs: readonly string[]) => {
  for (const input of inputs) expect([input, outcome(input, target)]).toEqual([input, 'correct']);
};

describe('pinyin input forms', () => {
  it('accepts tone numbers, tone marks, case, spaces and apostrophes for 你好', () => {
    accepts(nihao, ['ni3 hao3', 'nǐ hǎo', 'ni3hao3', 'nǐhǎo', 'NI3 HAO3', 'Nǐ Hǎo', "ni3'hao3", 'ni3-hao3', '  nǐ   hao3 ', 'nǐ hao3']);
  });

  it('accepts combining tone marks as well as precomposed ones', () => {
    accepts(nihao, ['nǐ hǎo'.normalize('NFD')]);
    accepts(ng, ['ǹg'.normalize('NFD')]);
  });

  it('reads ü written as ü, v or u:, in 女 and 女儿', () => {
    accepts(nv, ['nv3', 'nu:3', 'nǚ', 'nü3', 'NV3', 'NU:3']);
    accepts(nuer, ['nv3 er2', 'nu:3 er2', 'nǚ ér', "nǚ'ér", 'nü3er2', 'NV3ER2', 'nv3er2']);
  });

  it('reads 绿 lǜ in every ü spelling', () => {
    accepts(lv, ['lv4', 'lu:4', 'lǜ', 'LV4', 'lü4', 'LǛ']);
  });

  it('does not take u for ü: nu is 努, not 女', () => {
    const result = evaluatePinyinAnswer('nu3', nv);
    expect(result.evaluation).toEqual({ outcome: 'incorrect' });
    expect(result.diagnosis.syllableErrors).toEqual([{ kind: 'wrong', position: 0, expected: 'nǚ', given: 'nu' }]);
    expect(result.diagnosis.toneErrors).toEqual([]);
    expect(evaluatePinyinAnswer('lu4', lv).diagnosis.syllableErrors).toEqual([{ kind: 'wrong', position: 0, expected: 'lǜ', given: 'lu' }]);
    expect(outcome('nu3 er2', nuer)).toBe('incorrect');
  });

  it('accepts the neutral tone as 5, 0 or no mark in 爸爸', () => {
    accepts(baba, ['ba4 ba5', 'ba4 ba0', 'ba4 ba', 'bà ba', 'bàba', 'ba4ba']);
  });

  it('keeps a neutral tone neutral', () => {
    const result = evaluatePinyinAnswer('ba4 ba4', baba);
    expect(result.evaluation.outcome).toBe('incorrect');
    expect(result.diagnosis.toneErrors).toEqual([{ position: 1, syllable: 'ba', expected: 5, accepted: [5], given: 4 }]);
  });

  it('reads 嗯 ǹg, a syllable without a vowel, and keeps its tone', () => {
    accepts(ng, ['ng4', 'ǹg', 'NG4', 'Ǹg']);
    expect(evaluatePinyinAnswer('ng2', ng).diagnosis.toneErrors).toEqual([{ position: 0, syllable: 'ǹg', expected: 4, accepted: [4], given: 2 }]);
    expect(evaluatePinyinAnswer('n4', ng).diagnosis.syllableErrors).toEqual([{ kind: 'wrong', position: 0, expected: 'ǹg', given: 'n' }]);
  });
});

describe('tone sandhi', () => {
  it('accepts 一定 in its dictionary and spoken readings', () => {
    accepts(yiding, ['yi1 ding4', 'yī dìng', 'yi2 ding4', 'yí dìng']);
    expect(expectedReading(yiding).map((s) => s.accepted)).toEqual([[1, 2], [4]]);
    const result = evaluatePinyinAnswer('yi4 ding4', yiding);
    expect(result.diagnosis.toneErrors).toEqual([{ position: 0, syllable: 'yī', expected: 1, accepted: [1, 2], given: 4 }]);
  });

  it('accepts the same tones when the entry already carries the spoken reading', () => {
    const spoken = { ...yiding, pinyin: 'yí dìng' };
    expect(expectedReading(spoken).map((s) => s.accepted)).toEqual([[1, 2], [4]]);
  });

  it('accepts 不客气 as bù or bú before a fourth tone', () => {
    accepts(bukeqi, ['bu4 ke4 qi5', 'bu2 ke4 qi5', 'bú kè qi', 'bù kè qi', 'bu4ke4qi', 'bu2 ke4 qi0']);
    expect(evaluatePinyinAnswer('bu2 ke4 qi4', bukeqi).diagnosis.toneErrors).toEqual([
      { position: 2, syllable: 'qi', expected: 5, accepted: [5], given: 4 },
    ]);
  });

  it('accepts a third tone as second before another third tone (3-3)', () => {
    accepts(nihao, ['ni2 hao3', 'ní hǎo']);
    accepts(laohu, ['lao3 hu3', 'lao2 hu3']);
    expect(evaluatePinyinAnswer('ni3 hao2', nihao).diagnosis.toneErrors).toEqual([
      { position: 1, syllable: 'hǎo', expected: 3, accepted: [3], given: 2 },
    ]);
  });
});

describe('diagnosis', () => {
  it('rejects omitted tones in a tone exercise, as neutral tones where the reading has none', () => {
    const result = evaluatePinyinAnswer('ni hao', nihao);
    expect(result.evaluation).toEqual({ outcome: 'incorrect' });
    expect(result.diagnosis.syllableErrors).toEqual([]);
    expect(result.diagnosis.toneErrors.map((error) => [error.position, error.given])).toEqual([[0, 5], [1, 5]]);
  });

  it('reports tone errors without failing when tones are only reported', () => {
    const result = evaluatePinyinAnswer('ni hao', nihao, 'reported');
    expect(result.evaluation).toEqual({ outcome: 'correct' });
    expect(result.diagnosis.toneErrors).toHaveLength(2);
    expect(evaluatePinyinAnswer('ni3 hau3', nihao, 'reported').evaluation).toEqual({ outcome: 'incorrect' });
  });

  it('separates syllable errors from tone errors', () => {
    const result = evaluatePinyinAnswer('ni2 hou4', nihao);
    expect(result.diagnosis.syllableErrors).toEqual([{ kind: 'wrong', position: 1, expected: 'hǎo', given: 'hou' }]);
    expect(result.diagnosis.toneErrors).toEqual([]);
    expect(result.diagnosis.given).toEqual([{ base: 'ni', tone: 2 }, { base: 'hou', tone: 4 }]);
  });

  it('reports missing and extra syllables', () => {
    expect(evaluatePinyinAnswer('ni3', nihao).diagnosis.syllableErrors).toEqual([{ kind: 'missing', position: 1, expected: 'hǎo', given: null }]);
    expect(evaluatePinyinAnswer('ni3 hao3 ma5', nihao).diagnosis.syllableErrors).toEqual([{ kind: 'extra', position: 1, expected: null, given: 'ma' }]);
    expect(evaluatePinyinAnswer('nihaoma', nihao).diagnosis.syllableErrors).toEqual([{ kind: 'extra', position: 1, expected: null, given: 'ma' }]);
  });

  it('treats a syllable with two different tones as a tone error, not a format error', () => {
    const result = evaluatePinyinAnswer('nǐ4 hao3', nihao);
    expect(result.evaluation).toEqual({ outcome: 'incorrect' });
    expect(result.diagnosis.toneErrors).toEqual([{ position: 0, syllable: 'nǐ', expected: 3, accepted: [2, 3], given: null }]);
  });

  it('names the policy version and the entry compared', () => {
    const result = evaluatePinyinAnswer('ni3 hao3', nihao);
    expect(result.diagnosis.policyVersion).toBe(PINYIN_POLICY_VERSION);
    expect(result.diagnosis.contentId).toBe(nihao.id);
  });
});

describe('format errors', () => {
  it.each([
    ['ni3 hao3!', 'unexpected-character'],
    ['你好', 'unexpected-character'],
    ['ni7 hao3', 'unknown-tone-number'],
    ['3ni hao3', 'misplaced-digit'],
    ['ni33 hao3', 'misplaced-digit'],
  ])('%s is invalid, never incorrect', (input, kind) => {
    const result = evaluatePinyinAnswer(input, nihao);
    expect(result.evaluation).toEqual({ outcome: 'invalid', reason: 'other' });
    expect(result.diagnosis.formatErrors.map((error) => error.kind)).toContain(kind);
    expect(result.diagnosis.syllableErrors).toEqual([]);
    expect(result.diagnosis.toneErrors).toEqual([]);
  });

  it('does not need the expected answer to find format errors', () => {
    expect(parsePinyinInput('ni3, hao3').kind).toBe('format-error');
    expect(parsePinyinInput('ni3 hao3').kind).toBe('tokens');
    expect(parsePinyinInput("'-")).toEqual({ kind: 'format-error', errors: [{ kind: 'no-syllables' }] });
  });

  it('treats empty input as unanswered', () => {
    expect(evaluatePinyinAnswer('', nihao).evaluation).toEqual({ outcome: 'unanswered' });
    expect(evaluatePinyinAnswer('   ', nihao).evaluation).toEqual({ outcome: 'unanswered' });
  });
});

describe('several accepted entries', () => {
  it('matches either reading of 还 when both are accepted', () => {
    expect(evaluatePinyinAgainst('hai2', [hai, huan]).diagnosis.contentId).toBe(hai.id);
    expect(evaluatePinyinAgainst('huan2', [hai, huan]).diagnosis.contentId).toBe(huan.id);
    expect(evaluatePinyinAgainst('huan2', [hai, huan]).evaluation).toEqual({ outcome: 'correct' });
  });

  it('rejects the other reading when only one is accepted', () => {
    const result = evaluatePinyinAnswer('huan2', hai);
    expect(result.evaluation).toEqual({ outcome: 'incorrect' });
    expect(result.diagnosis.syllableErrors).toEqual([{ kind: 'wrong', position: 0, expected: 'hái', given: 'huan' }]);
  });

  it('diagnoses against the closest entry', () => {
    const result = evaluatePinyinAgainst('huan3', [hai, huan]);
    expect(result.diagnosis.contentId).toBe(huan.id);
    expect(result.diagnosis.toneErrors).toEqual([{ position: 0, syllable: 'huán', expected: 2, accepted: [2], given: 3 }]);
  });
});

it('is deterministic', () => {
  const inputs = ['nǐhao3', 'ni hao', 'yi2ding4', 'xx!', 'bu2 ke4 qi4'];
  const run = () => inputs.map((input) => evaluatePinyinAgainst(input, [nihao, yiding, bukeqi]));
  expect(run()).toEqual(run());
});
