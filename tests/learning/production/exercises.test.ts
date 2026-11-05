import { describe, expect, it } from 'vitest';
import { evaluateAttempt } from '../../../src/domain/learning/evaluation';
import {
  PINYIN_POLICY_VERSION,
  TYPED_ANSWER_POLICY_VERSION,
  acceptedAnswers,
  buildProductionExercise,
  gradeTypedAnswer,
  isTypedAnswerExercise,
  regradeTypedAnswers,
  type ProductionExercise,
  type ProductionKind,
} from '../../../src/domain/learning/production';
import type { AttemptAction, Evaluation, ItemId } from '../../../src/domain/learning/types';
import type { WordEntry } from '../../../src/domain/learning/exercises';
import { context, vocabulary, word } from '../exercises/fixtures';

const KINDS: readonly ProductionKind[] = ['pinyin-from-characters', 'pinyin-from-gloss', 'characters-from-audio', 'gloss-from-audio'];

const ta = word('word-4ed6-ta');
const taFemale = word('word-5979-ta');
const zai = word('word-5728-zai4');
const zaiAgain = word('word-518d-zai4');
const hai = word('word-8fd8-hai2');
const huan = word('word-8fd8-huan2');
const nihao = word('word-4f60-597d-ni3-hao3');
const de = word('word-7684-de5');

const build = (kind: ProductionKind, entry: WordEntry, overrides: Parameters<typeof context>[0] = {}, seed = 1): ProductionExercise => {
  const built = buildProductionExercise(kind, entry, context(overrides, seed));
  if (!('exercise' in built)) throw new Error(`Skipped: ${built.skip}`);
  return built.exercise;
};
const ids = (exercise: ProductionExercise) => exercise.accepted.map((entry) => entry.id);
const grade = (exercise: ProductionExercise, text: string) => gradeTypedAnswer(exercise, text)?.evaluation.outcome;

describe('exercise shapes', () => {
  it.each([
    ['pinyin-from-characters', 'tones', 'characters', 'typed-pinyin', PINYIN_POLICY_VERSION],
    ['pinyin-from-gloss', 'production', 'gloss', 'typed-pinyin', PINYIN_POLICY_VERSION],
    ['characters-from-audio', 'listening', 'audio', 'typed-characters', TYPED_ANSWER_POLICY_VERSION],
    ['gloss-from-audio', 'listening', 'audio', 'typed-gloss', TYPED_ANSWER_POLICY_VERSION],
  ] as const)('%s trains %s from %s', (kind, skill, cue, rubricId, revision) => {
    const exercise = build(kind, nihao);
    expect(exercise).toMatchObject({ skill, cue, format: 'free-recall', grading: 'automatic', options: [], rubric: { id: rubricId, revision } });
    expect(exercise.answer).toEqual({ characters: '你好', pinyin: 'nǐ hǎo', meaning: 'Hola' });
    expect(exercise.id.startsWith(`exercise:word-meaning:${nihao.id}:${kind}:`)).toBe(true);
    expect(isTypedAnswerExercise(exercise)).toBe(true);
  });

  it('gives the reading exercises no audio, since hearing the word gives the tones away', () => {
    expect(build('pinyin-from-characters', nihao).audio).toBeNull();
    expect(build('pinyin-from-gloss', nihao).audio).toBeNull();
    expect(build('characters-from-audio', nihao).audio).toEqual({ source: 'speech-synthesis', hanzi: '你好', pinyin: 'nǐ hǎo' });
  });

  it('skips audio cues without speech and function words asked or answered by gloss', () => {
    expect(buildProductionExercise('characters-from-audio', nihao, context({ speechAvailable: false }))).toEqual({ skip: 'speech-unavailable' });
    expect(buildProductionExercise('gloss-from-audio', nihao, context({ speechAvailable: false }))).toEqual({ skip: 'speech-unavailable' });
    expect(buildProductionExercise('pinyin-from-gloss', de, context())).toEqual({ skip: 'function-word' });
    expect(buildProductionExercise('gloss-from-audio', de, context())).toEqual({ skip: 'function-word' });
    expect('exercise' in buildProductionExercise('pinyin-from-characters', de, context())).toBe(true);
  });

  it('is deterministic for equal seeds', () => {
    for (const kind of KINDS) expect(build(kind, ta, {}, 7)).toEqual(build(kind, ta, {}, 7));
  });

  it('stores the accepted answers acceptedAnswers computes, so building and grading agree', () => {
    for (const entry of [ta, zai, hai, nihao, word('word-9ad8-5174-gao-xing4')]) {
      for (const kind of KINDS) {
        const exercise = build(kind, entry);
        expect(acceptedAnswers(exercise, vocabulary)).toEqual(exercise.accepted);
      }
    }
  });
});

describe('equivalent answers', () => {
  it('accepts 他 and 她 typed from audio without context', () => {
    const exercise = build('characters-from-audio', ta);
    expect(ids(exercise)).toEqual(expect.arrayContaining([ta.id, taFemale.id]));
    expect(grade(exercise, '他')).toBe('correct');
    expect(grade(exercise, '她')).toBe('correct');
    expect(grade(exercise, '在')).toBe('incorrect');
    expect(gradeTypedAnswer(build('characters-from-audio', taFemale), '他')?.evaluation).toEqual({ outcome: 'correct' });
  });

  it('accepts 在 and 再 typed from audio without context', () => {
    const exercise = build('characters-from-audio', zai);
    expect(ids(exercise)).toEqual([zai.id, zaiAgain.id]);
    expect(grade(exercise, '再')).toBe('correct');
    expect(grade(exercise, ' 在 ')).toBe('correct');
  });

  it('accepts the meaning of any homophone typed from audio', () => {
    expect(grade(build('gloss-from-audio', ta), 'Ella')).toBe('correct');
    expect(grade(build('gloss-from-audio', ta), 'él')).toBe('correct');
    expect(grade(build('gloss-from-audio', zai), 'otra vez')).toBe('correct');
    expect(grade(build('gloss-from-audio', zai), 'Estar en.')).toBe('correct');
    expect(grade(build('gloss-from-audio', zai), 'tigre')).toBe('incorrect');
  });

  it('accepts one homophone only when a context names the word', () => {
    const exercise = build('characters-from-audio', ta);
    const withContext = { ...exercise, context: '___ es mi hermano.' };
    expect(acceptedAnswers(withContext, vocabulary).map((entry) => entry.id)).toEqual([ta.id]);
  });

  it('disambiguates 还 with its gloss, and accepts both readings without context', () => {
    const exercise = build('pinyin-from-characters', hai);
    expect(exercise.context).toBe('Todavía');
    expect(ids(exercise)).toEqual([hai.id]);
    expect(grade(exercise, 'hai2')).toBe('correct');
    expect(grade(exercise, 'huan2')).toBe('incorrect');

    const bare = { ...exercise, context: null };
    const accepted = acceptedAnswers(bare, vocabulary);
    expect(accepted.map((entry) => entry.id)).toEqual([hai.id, huan.id]);
    expect(gradeTypedAnswer({ ...bare, accepted }, 'huan2')?.evaluation).toEqual({ outcome: 'correct' });
  });

  it('gives a word with one reading no context', () => {
    expect(build('pinyin-from-characters', nihao).context).toBeNull();
  });

  it('accepts every word a Spanish prompt fits, per the catalog senses', () => {
    // A custom word whose only sense is "feliz": every catalog word of the same length with that
    // sense fits the prompt as well.
    const kaixin: WordEntry = { id: 'custom-5f00-5fc3', simplified: '开心', traditional: '開心', pinyin: 'kāi xīn', senses: [{ text: 'feliz' }] };
    const exercise = build('pinyin-from-gloss', kaixin, { vocabulary: [...vocabulary, kaixin] });
    expect(exercise.context).toBe('2 caracteres');
    expect(ids(exercise)).toEqual(expect.arrayContaining([kaixin.id, 'word-9ad8-5174-gao-xing4', 'word-5feb-4e50-kuai4-le4']));
    expect(grade(exercise, 'kai1 xin1')).toBe('correct');
    expect(grade(exercise, 'gao1 xing4')).toBe('correct');
    expect(grade(exercise, 'kuài lè')).toBe('correct');
  });

  it('accepts only the target when the second sense tells it apart', () => {
    // 高兴 is asked as "feliz, contento"; 快乐 is not "contento".
    const exercise = build('pinyin-from-gloss', word('word-9ad8-5174-gao-xing4'));
    expect(ids(exercise)).toEqual(['word-9ad8-5174-gao-xing4']);
    expect(grade(exercise, 'kuai4 le4')).toBe('incorrect');
  });
});

describe('grading by skill', () => {
  it('requires tones for the tones exercise and only reports them for production', () => {
    const tones = gradeTypedAnswer(build('pinyin-from-characters', nihao), 'ni hao');
    const production = gradeTypedAnswer(build('pinyin-from-gloss', nihao), 'ni hao');
    expect(tones?.evaluation).toEqual({ outcome: 'incorrect' });
    expect(production?.evaluation).toEqual({ outcome: 'correct' });
    expect(production?.kind === 'pinyin' && production.diagnosis.toneErrors).toHaveLength(2);
  });

  it('makes unreadable input invalid in every typed exercise', () => {
    expect(gradeTypedAnswer(build('pinyin-from-characters', nihao), 'ni3 hao3?')?.evaluation).toEqual({ outcome: 'invalid', reason: 'other' });
    expect(gradeTypedAnswer(build('characters-from-audio', nihao), 'ni hao')?.evaluation).toEqual({ outcome: 'invalid', reason: 'other' });
  });

  it('treats empty input as unanswered', () => {
    for (const kind of KINDS) expect(gradeTypedAnswer(build(kind, nihao), '  ')?.evaluation).toEqual({ outcome: 'unanswered' });
    expect(gradeTypedAnswer(build('pinyin-from-characters', nihao), null)?.evaluation).toEqual({ outcome: 'unanswered' });
  });

  it('grades nothing that is not a typed exercise', () => {
    const meaning = { ...build('pinyin-from-characters', nihao), skill: 'meaning' as const, grading: 'self-assessment' as const, rubric: { id: 'self-assessment', revision: 'x' } };
    expect(gradeTypedAnswer(meaning, 'ni3 hao3')).toBeNull();
    const futurePolicy = { ...build('pinyin-from-characters', nihao), rubric: { id: 'typed-pinyin', revision: 'pinyin-policy@99' } };
    expect(gradeTypedAnswer(futurePolicy, 'ni3 hao3')).toBeNull();
  });

  it('falls back to the revealed answer when an exercise carries no accepted list', () => {
    const { accepted: _accepted, ...stored } = build('pinyin-from-characters', word('word-4e00-5b9a-yi-ding4'));
    expect(gradeTypedAnswer(stored, 'yi1 ding4')?.evaluation).toEqual({ outcome: 'correct' });
    expect(gradeTypedAnswer(stored, 'yi2 ding4')?.evaluation).toEqual({ outcome: 'correct' });
  });
});

describe('evaluator integration', () => {
  let clock = 1_000;
  const typed = (answer: string, evaluation: Evaluation): AttemptAction => ({
    type: 'answer', at: (clock += 1_000), answer, selectedOptionId: null, evaluation,
  });
  const itemId: ItemId = `word-meaning:${nihao.id}`;

  it('regrades typed answers from their text and leaves consistent actions alone', () => {
    const exercise = build('pinyin-from-characters', nihao);
    const honest = [typed('ni3 hao3', { outcome: 'correct' })];
    expect(regradeTypedAnswers(exercise, honest)).toBe(honest);
    const claimed = [typed('ni hao', { outcome: 'correct' }), typed('ni3 hao3', { outcome: 'incorrect' })];
    expect(regradeTypedAnswers(exercise, claimed).map((action) => action.type === 'answer' && action.evaluation.outcome)).toEqual(['incorrect', 'correct']);
  });

  it('leaves actions of exercises that are not typed untouched', () => {
    const exercise = { ...build('pinyin-from-characters', nihao), format: 'multiple-choice' as const };
    const actions = [typed('ni hao', { outcome: 'correct' })];
    expect(regradeTypedAnswers(exercise, actions)).toBe(actions);
  });

  it.each(KINDS)('%s never rates and observes only its own skill', (kind) => {
    const exercise = build(kind, nihao);
    const right = { 'pinyin-from-characters': 'ni3 hao3', 'pinyin-from-gloss': 'ni3 hao3', 'characters-from-audio': '你好', 'gloss-from-audio': 'hola' }[kind];
    const actions = regradeTypedAnswers(exercise, [typed(right, { outcome: 'incorrect' })]);
    const result = evaluateAttempt({ id: `attempt-${kind}`, itemId, actions }, exercise, {
      sessionMode: 'today',
      scheduledEligible: true,
      alreadyKnownCheck: false,
    });
    expect(result).toMatchObject({ kind: 'practice', reason: 'exercise', evaluation: { outcome: 'correct' } });
    expect(result.evidence.map((evidence) => evidence.skill)).toEqual([exercise.skill]);
  });

  it('turns a format error into an invalid attempt, which is why screens check input first', () => {
    const exercise = build('pinyin-from-characters', nihao);
    const actions = regradeTypedAnswers(exercise, [typed('ni3 hao3!', { outcome: 'incorrect' })]);
    const result = evaluateAttempt({ id: 'attempt-format', itemId, actions }, exercise, {
      sessionMode: 'today',
      scheduledEligible: true,
      alreadyKnownCheck: false,
    });
    expect(result).toMatchObject({ kind: 'invalid-attempt', evaluation: { outcome: 'invalid', reason: 'other' }, evidence: [] });
  });
});
