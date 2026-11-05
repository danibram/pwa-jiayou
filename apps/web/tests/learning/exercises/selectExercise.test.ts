import { describe, expect, it } from 'vitest';
import { contentReferenceForCharacter, contentReferenceForWord } from '@jiayou/content';
import { evaluateAttempt, evaluatorVersion } from '@jiayou/learning/evaluation';
import { ratingTaskOf } from '@jiayou/learning/evaluation/rules';
import { gradeTypedAnswer, isTypedAnswerExercise, PRODUCTION_ROLES } from '@jiayou/learning/production';
import {
  buildOptions,
  displayGloss,
  PRACTICE_LADDER,
  practiceRung,
  isFunctionWord,
  selectExercise,
  seededRandom,
  sharesSense,
  soundsSame,
  STROKE_RUBRIC_REVISION,
  type ExerciseSelection,
  type WordEntry,
} from '@jiayou/learning/exercises';
import type { AttemptAction, Exercise, ItemId } from '@jiayou/learning/types';
import { ambiguityCases } from '../fixtures/contentCases';
import { SEEDS, card, context, hsk1Characters, observation, settled, vocabulary, word, wordItem } from './fixtures';

const exerciseOf = (selection: ExerciseSelection): Exercise => {
  if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
  return selection.exercise;
};

const selfRated: AttemptAction[] = [
  { type: 'reveal', at: 2_000 },
  { type: 'self-assessment', at: 3_000, rating: 'good' },
];

/** Every pair of options in a set, by the words they stand for. */
const optionWords = (exercise: Exercise): WordEntry[] => exercise.options.map((option) => word(option.contentId!));
const pairs = <T>(items: readonly T[]): [T, T][] => items.flatMap((a, i) => items.slice(i + 1).map((b) => [a, b] as [T, T]));

describe('scheduled and already-known cards on words', () => {
  const ni = word('word-4f60-597d-ni3-hao3');

  it('builds the rateable meaning card that the evaluator accepts as a rating task', () => {
    const selection = selectExercise(card(wordItem(ni), 'scheduled', 'due-review'), { kind: 'word', word: ni }, context());
    const exercise = exerciseOf(selection);
    expect(exercise).toMatchObject({
      skill: 'meaning',
      format: 'free-recall',
      grading: 'self-assessment',
      cue: 'characters',
      options: [],
      context: null,
      answer: { characters: '你好', pinyin: 'nǐ hǎo', meaning: displayGloss(ni) },
      rubric: { id: 'self-assessment', revision: evaluatorVersion },
    });
    expect(selection).toMatchObject({ prompt: 'meaning', skipped: [], evaluatorVersion, content: contentReferenceForWord(ni) });
    expect(ratingTaskOf(wordItem(ni), exercise)).toBe('meaning');

    const result = evaluateAttempt(
      { id: 'a1', itemId: wordItem(ni), actions: selfRated },
      exercise,
      { sessionMode: 'today', scheduledEligible: true, alreadyKnownCheck: false },
    );
    expect(result).toMatchObject({ kind: 'scheduled-review', basis: 'due', rating: 'good' });
  });

  it('asks an already-known check among options, and a right first pick rates as already-known', () => {
    const exercise = exerciseOf(selectExercise(card(wordItem(ni), 'already-known-check', 'claimed-known'), { kind: 'word', word: ni }, context()));
    expect(exercise).toMatchObject({ skill: 'meaning', format: 'multiple-choice', cue: 'characters', grading: 'automatic' });
    const right = exercise.options.find((option) => option.contentId === ni.id)!;
    const result = evaluateAttempt(
      { id: 'a2', itemId: wordItem(ni), actions: [{ type: 'answer', at: 1, answer: right.text, selectedOptionId: right.id, evaluation: { outcome: 'correct' } }] },
      exercise,
      { sessionMode: 'today', scheduledEligible: false, alreadyKnownCheck: true },
    );
    expect(result).toMatchObject({ kind: 'scheduled-review', basis: 'already-known', rating: 'good' });
  });

  it('never gives a scheduled card options or audio-only cues, whatever the seed', () => {
    for (const seed of SEEDS) {
      const exercise = exerciseOf(selectExercise(card(wordItem(ni), 'scheduled', 'first-rating'), { kind: 'word', word: ni }, context({}, seed)));
      expect(exercise.cue).toBe('characters');
      expect(exercise.options).toEqual([]);
    }
  });

  it('rejects content that is not the item', () => {
    expect(() => selectExercise(card(wordItem(ni), 'scheduled'), { kind: 'word', word: word('word-7231-ai4') }, context())).toThrow();
  });
});

describe('function words (P7)', () => {
  it('asks for the function and reveals the editorial gloss', () => {
    for (const id of ['word-7684-de5', 'word-4e2a-ge4', 'word-5417-ma5']) {
      const entry = word(id);
      expect(isFunctionWord(entry), id).toBe(true);
      const exercise = exerciseOf(selectExercise(card(wordItem(entry), 'scheduled', 'due-review'), { kind: 'word', word: entry }, context()));
      expect(exercise.prompt).toBe('¿Qué función cumple esta palabra?');
      expect(exercise.answer?.meaning).toBe(displayGloss(entry));
      expect(ratingTaskOf(wordItem(entry), exercise)).toBe('meaning');
    }
    expect(displayGloss(word('word-7684-de5'))).toBe('Partícula posesiva y atributiva');
  });

  it('never cues a function word from its gloss in practice', () => {
    const de = word('word-7684-de5');
    for (const seed of SEEDS) {
      const selection = selectExercise(card(wordItem(de), 'practice'), { kind: 'word', word: de }, context({ recentEvidence: settled() }, seed));
      expect(exerciseOf(selection).cue).not.toBe('gloss');
    }
  });
});

describe('speech availability', () => {
  const sample = vocabulary.filter((_, index) => index % 97 === 0);

  it('never builds an audio format or attaches audio when speech is unavailable', () => {
    for (const entry of sample) {
      for (const seed of SEEDS.slice(0, 5)) {
        for (const recentEvidence of [[], settled()]) {
          const selection = selectExercise(card(wordItem(entry), 'practice'), { kind: 'word', word: entry }, context({ speechAvailable: false, recentEvidence }, seed));
          const exercise = exerciseOf(selection);
          expect(exercise.cue, entry.id).not.toBe('audio');
          expect(exercise.audio).toBeNull();
          if (selection.kind === 'exercise') {
            for (const skip of selection.skipped) {
              if (skip.prompt === 'hear' || skip.prompt === 'listen') expect(skip.reason).toBe('speech-unavailable');
            }
          }
        }
      }
    }
  });

  it('records the skipped audio format when it would have come first', () => {
    const ni = word('word-4f60-597d-ni3-hao3');
    // Rung 2. Meaning and production were seen, listening was not, so listen comes first.
    const recentEvidence = settled(['meaning', 'production']);
    const selection = selectExercise(card(wordItem(ni), 'practice'), { kind: 'word', word: ni }, context({ speechAvailable: false, recentEvidence }));
    if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
    expect(selection.skipped[0]).toEqual({ prompt: 'listen', reason: 'speech-unavailable' });
    expect(selection.prompt).toBe('reverse');
    expect(selection.exercise.cue).not.toBe('audio');
  });

  it('attaches speech audio when available', () => {
    const ni = word('word-4f60-597d-ni3-hao3');
    const exercise = exerciseOf(selectExercise(card(wordItem(ni), 'scheduled'), { kind: 'word', word: ni }, context()));
    expect(exercise.audio).toEqual({ source: 'speech-synthesis', hanzi: '你好', pinyin: 'nǐ hǎo' });
  });
});

describe('ambiguity catalog', () => {
  const formats = [
    { name: 'hear', audio: true, text: (entry: WordEntry) => entry.simplified },
    { name: 'pick', audio: false, text: (entry: WordEntry) => entry.simplified },
    { name: 'recognize', audio: false, text: displayGloss },
  ] as const;

  for (const example of ambiguityCases) {
    const entries = example.entries.map((entry) => word(entry.id));
    for (const target of entries) {
      const partners = entries.filter((other) => other.id !== target.id);
      // A homophone only clashes by ear; a shared sense or shared characters clash in every format.
      const byEarOnly = example.kind === 'homophone' || example.kind === 'particle';
      const checked = byEarOnly ? formats.filter((format) => format.audio) : formats;
      it(`never offers ${partners.map((p) => `${p.simplified} ${p.pinyin}`).join(', ')} next to ${target.simplified} ${target.pinyin} (${checked.map((f) => f.name).join(', ')})`, () => {
        // The partners are familiar, so the ranking would put them first if nothing excluded them.
        const familiarIds = new Set(partners.map((p) => p.id));
        for (const format of checked) {
          for (const seed of SEEDS) {
            const options = buildOptions({
              target,
              vocabulary,
              text: format.text,
              audio: format.audio,
              familiar: (id) => familiarIds.has(id),
              random: seededRandom(seed),
            });
            expect(options, format.name).not.toBeNull();
            const ids = options!.map((option) => option.contentId);
            expect(ids).toContain(target.id);
            for (const partner of partners) expect(ids, `${format.name} seed ${seed}`).not.toContain(partner.id);
            expect(options!.length).toBeGreaterThanOrEqual(3);
            expect(options!.length).toBeLessThanOrEqual(4);
          }
        }
      });
    }
  }

  it('excludes homophones from hear options chosen by selectExercise', () => {
    for (const example of ambiguityCases.filter((c) => c.kind === 'homophone' || c.kind === 'particle')) {
      const entries = example.entries.map((entry) => word(entry.id));
      for (const target of entries) {
        const partners = new Set(entries.filter((other) => other.id !== target.id).map((other) => other.id));
        let heard = 0;
        for (const seed of SEEDS) {
          const selection = selectExercise(
            card(wordItem(target), 'practice'),
            { kind: 'word', word: target },
            // Rung 1, with production seen and listening not, so hear comes first.
            context({ recentEvidence: settled(['production']), familiar: (id) => partners.has(id) }, seed),
          );
          if (selection.kind !== 'exercise' || selection.prompt !== 'hear') continue;
          heard++;
          for (const option of selection.exercise.options) expect(partners.has(option.contentId!), target.id).toBe(false);
        }
        expect(heard, target.id).toBeGreaterThan(0);
      }
    }
  });

  it('skips free-recall listening on the homophones', () => {
    for (const id of ['word-4ed6-ta', 'word-5979-ta', 'word-5728-zai4', 'word-518d-zai4', 'word-7684-de5', 'word-5730-de5', 'word-5f97-de5']) {
      const entry = word(id);
      let skippedListen = false;
      for (const seed of SEEDS) {
        // Rung 2, with listening never seen, so listen comes first.
        const selection = selectExercise(card(wordItem(entry), 'practice'), { kind: 'word', word: entry }, context({ recentEvidence: settled(['meaning', 'production']) }, seed));
        if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
        expect(selection.prompt, id).not.toBe('listen');
        if (selection.skipped.some((skip) => skip.prompt === 'listen' && skip.reason === 'homophone')) skippedListen = true;
      }
      expect(skippedListen, id).toBe(true);
    }
  });

  it('shows the reading on the characters cue of 还 and 长, and never offers the other reading', () => {
    for (const [id, other] of [
      ['word-8fd8-hai2', 'word-8fd8-huan2'],
      ['word-8fd8-huan2', 'word-8fd8-hai2'],
      ['word-957f-chang2', 'word-957f-zhang3'],
      ['word-957f-zhang3', 'word-957f-chang2'],
    ]) {
      const entry = word(id);
      const meaning = exerciseOf(selectExercise(card(wordItem(entry), 'scheduled'), { kind: 'word', word: entry }, context()));
      expect(meaning.context, id).toBe(entry.pinyin);
      for (const seed of SEEDS) {
        const exercise = exerciseOf(selectExercise(card(wordItem(entry), 'practice', 'new-practice'), { kind: 'word', word: entry }, context({}, seed)));
        expect(exercise.options.map((option) => option.contentId)).not.toContain(other);
        if (exercise.cue === 'characters') expect(exercise.context).toBe(entry.pinyin);
      }
    }
  });

  it('keeps every practice option set free of shared senses, shared characters and, by ear, shared sounds', () => {
    const sample = vocabulary.filter((_, index) => index % 41 === 0);
    let checked = 0;
    for (const entry of sample) {
      for (const seed of SEEDS.slice(0, 4)) {
        for (const recentEvidence of [[], settled()]) {
          const exercise = exerciseOf(selectExercise(card(wordItem(entry), 'practice'), { kind: 'word', word: entry }, context({ recentEvidence }, seed)));
          if (exercise.format !== 'multiple-choice') continue;
          checked++;
          const words = optionWords(exercise);
          expect(words.filter((other) => other.id === entry.id)).toHaveLength(1);
          expect(new Set(exercise.options.map((option) => option.text.toLowerCase())).size).toBe(words.length);
          for (const [a, b] of pairs(words)) {
            expect(a.simplified, `${a.id} ${b.id}`).not.toBe(b.simplified);
            expect(sharesSense(a, b), `${a.id} ${b.id}`).toBe(false);
            if (exercise.cue === 'audio') expect(soundsSame(a, b), `${a.id} ${b.id}`).toBe(false);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('asks reverse only with a gloss no other word of the same shape answers to', () => {
    // 高兴 and 快乐 share "feliz": the second sense comes along and tells them apart.
    const gao = word('word-9ad8-5174-gao-xing4');
    for (const seed of SEEDS) {
      const selection = selectExercise(card(wordItem(gao), 'practice'), { kind: 'word', word: gao }, context({ recentEvidence: settled(['meaning', 'listening']) }, seed));
      const exercise = exerciseOf(selection);
      if (selection.kind === 'exercise' && selection.prompt === 'reverse') expect(exercise.prompt).toBe('¿Cómo se escribe «feliz, contento»?');
      if (selection.kind === 'exercise' && selection.prompt === 'pick') expect(exercise.prompt).toBe('¿Cómo se dice «feliz, contento»?');
    }
  });
});

describe('fallback', () => {
  const ni = word('word-4f60-597d-ni3-hao3');

  it('falls back to the meaning card and says why when the pool is too small for options', () => {
    const tiny = [ni, word('word-7231-ai4')];
    for (const seed of SEEDS) {
      const selection = selectExercise(card(wordItem(ni), 'practice', 'new-practice'), { kind: 'word', word: ni }, context({ vocabulary: tiny }, seed));
      if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
      expect(selection.prompt).toBe('meaning');
      expect(selection.exercise.options).toEqual([]);
      expect(selection.skipped.map((skip) => skip.prompt).sort()).toEqual(['hear', 'pick', 'recognize']);
      expect(new Set(selection.skipped.map((skip) => skip.reason))).toEqual(new Set(['too-few-distractors']));
    }
  });

  it('builds three options from two distractors', () => {
    const small = [ni, word('word-7231-ai4'), word('word-516b-ba')];
    const options = buildOptions({ target: ni, vocabulary: small, text: displayGloss, audio: false, random: seededRandom(3) });
    expect(options).toHaveLength(3);
  });

  it('falls to the meaning card when synonyms leave too few distractors', () => {
    // Only 爱 and 喜欢 besides the target 快乐... and 高兴, which shares "feliz".
    const kuai = word('word-5feb-4e50-kuai4-le4');
    const pool = [kuai, word('word-9ad8-5174-gao-xing4'), word('word-7231-ai4')];
    const selection = selectExercise(card(wordItem(kuai), 'practice', 'new-practice'), { kind: 'word', word: kuai }, context({ vocabulary: pool }));
    expect(selection).toMatchObject({ kind: 'exercise', prompt: 'meaning' });
  });
});

describe('determinism', () => {
  it('gives the same exercise for the same seed and varies with the seed', () => {
    const ni = word('word-4f60-597d-ni3-hao3');
    const run = (seed: number) =>
      selectExercise(card(wordItem(ni), 'practice', 'new-practice'), { kind: 'word', word: ni }, context({}, seed));
    expect(run(7)).toEqual(run(7));
    const variants = new Set(SEEDS.map((seed) => JSON.stringify(run(seed))));
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe('practice formats', () => {
  const ni = word('word-4f60-597d-ni3-hao3');

  it('keeps a word just taught on automatically graded formats', () => {
    for (const seed of SEEDS) {
      const exercise = exerciseOf(selectExercise(card(wordItem(ni), 'practice', 'new-practice'), { kind: 'word', word: ni }, context({ recentEvidence: settled() }, seed)));
      expect(exercise.grading).toBe('automatic');
    }
  });

  it('trains the skill observed longest ago', () => {
    // Rung 2. Listening and meaning were seen recently; production was not.
    const recentEvidence = settled(['listening', 'meaning']);
    for (const seed of SEEDS) {
      const exercise = exerciseOf(selectExercise(card(wordItem(ni), 'practice', 'seen'), { kind: 'word', word: ni }, context({ recentEvidence }, seed)));
      expect(exercise.skill).toBe('production');
    }
  });

  it('reaches self-assessed free recall on rung 2', () => {
    const prompts = new Set(
      SEEDS.map((seed) => {
        // Production and listening were seen at the same time, so the seed picks between them.
        const recentEvidence = [observation(1_000, 'correct', { skill: 'production' }), observation(1_000, 'correct', { skill: 'listening' })];
        const selection = selectExercise(card(wordItem(ni), 'practice', 'seen'), { kind: 'word', word: ni }, context({ recentEvidence }, seed));
        return selection.kind === 'exercise' ? selection.prompt : 'exposure';
      }),
    );
    expect(prompts).toEqual(new Set(['reverse', 'listen']));
  });

  it('teaches with an exposure card', () => {
    const selection = selectExercise(card(wordItem(ni), 'teach', 'new'), { kind: 'word', word: ni }, context());
    expect(selection).toMatchObject({
      kind: 'exposure',
      content: contentReferenceForWord(ni),
      card: { reason: 'teaching', answer: { characters: '你好', pinyin: 'nǐ hǎo', meaning: 'Hola' }, audio: { source: 'speech-synthesis' } },
    });
  });
});

describe('practice ladder', () => {
  const ni = word('word-4f60-597d-ni3-hao3');
  const de = word('word-7684-de5');
  const practise = (entry: WordEntry, recentEvidence: ReturnType<typeof settled>, seed: number, overrides: Parameters<typeof context>[0] = {}, reason: Parameters<typeof card>[2] = 'seen') =>
    selectExercise(card(wordItem(entry), 'practice', reason), { kind: 'word', word: entry }, context({ recentEvidence, ...overrides }, seed));
  const promptOf = (selection: ExerciseSelection) => {
    if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
    return selection.prompt;
  };

  it('climbs one rung per autonomous correct answer, up to typed answers', () => {
    expect(practiceRung(card(wordItem(ni), 'practice'), [])).toBe(0);
    expect(practiceRung(card(wordItem(ni), 'practice'), settled(['meaning']))).toBe(1);
    expect(practiceRung(card(wordItem(ni), 'practice'), settled(['meaning', 'production']))).toBe(2);
    expect(practiceRung(card(wordItem(ni), 'practice'), settled())).toBe(3);
    expect(practiceRung(card(wordItem(ni), 'practice'), settled(['meaning', 'meaning', 'meaning', 'meaning', 'meaning']))).toBe(3);
  });

  it('steps one rung down after a failure and climbs again after a success', () => {
    const climbed = [observation(1), observation(2), observation(3), observation(4)];
    expect(practiceRung(card(wordItem(ni), 'practice'), [...climbed, observation(5, 'incorrect')])).toBe(2);
    expect(practiceRung(card(wordItem(ni), 'practice'), [...climbed, observation(5, 'unanswered')])).toBe(2);
    expect(practiceRung(card(wordItem(ni), 'practice'), [...climbed, observation(5, 'incorrect'), observation(6)])).toBe(3);
    // The order recorded counts, not the order given.
    expect(practiceRung(card(wordItem(ni), 'practice'), [observation(9), observation(1, 'incorrect')])).toBe(1);
    expect(practiceRung(card(wordItem(ni), 'practice'), [observation(1), observation(9, 'incorrect')])).toBe(0);
  });

  it('does not climb on an answer a hint gave away', () => {
    expect(practiceRung(card(wordItem(ni), 'practice'), [observation(1), observation(2, 'correct', { assisted: true })])).toBe(1);
  });

  it('keeps cards right after teaching on the supported rungs', () => {
    for (const reason of ['new-practice', 'teach-again'] as const) {
      expect(practiceRung(card(wordItem(ni), 'practice', reason), settled())).toBe(1);
      expect(practiceRung(card(wordItem(ni), 'practice', reason), [])).toBe(0);
    }
  });

  it('chooses a format from the rung the evidence reaches', () => {
    const histories = [[], settled(['meaning']), settled(['meaning', 'production']), settled()];
    histories.forEach((history, rung) => {
      for (const seed of SEEDS) {
        expect(PRACTICE_LADDER[rung], `rung ${rung} seed ${seed}`).toContain(promptOf(practise(ni, history, seed)));
      }
    });
  });

  it('shows only supported formats right after teaching, whatever the history', () => {
    for (const seed of SEEDS) {
      for (const reason of ['new-practice', 'teach-again'] as const) {
        const prompt = promptOf(practise(ni, settled(), seed, {}, reason));
        expect([...PRACTICE_LADDER[0], ...PRACTICE_LADDER[1]]).toContain(prompt);
      }
    }
  });

  it('moves the next practice back one rung after a failure', () => {
    const history = [...settled(), observation(9_000, 'incorrect')];
    for (const seed of SEEDS) expect(PRACTICE_LADDER[2]).toContain(promptOf(practise(ni, history, seed)));
  });

  it('starts with recognition and tries the other option formats before the meaning card', () => {
    const selection = practise(ni, [], 1, {}, 'new-practice');
    expect(promptOf(selection)).toBe('recognize');
    const tiny = [ni, word('word-7231-ai4')];
    const fallback = practise(ni, [], 1, { vocabulary: tiny }, 'new-practice');
    if (fallback.kind !== 'exercise') throw new Error('Expected an exercise');
    expect(fallback.skipped[0]).toEqual({ prompt: 'recognize', reason: 'too-few-distractors' });
    expect(fallback.prompt).toBe('meaning');
  });

  it('reaches every typed kind on rung 3, each trained skill first in turn', () => {
    const seen = new Set<string>();
    const histories = [
      settled(['meaning', 'production', 'listening']),
      settled(['tones', 'meaning', 'listening']),
      settled(['tones', 'production', 'meaning']),
    ];
    for (const history of histories) for (const seed of SEEDS) seen.add(promptOf(practise(ni, history, seed)));
    expect(seen).toEqual(new Set(PRACTICE_LADDER[3]));
  });

  it('builds typed exercises as the production module does, graded and never rated', () => {
    for (const history of [settled(['meaning', 'production', 'listening']), settled(['tones', 'meaning', 'listening'])]) {
      for (const seed of SEEDS.slice(0, 10)) {
        const selection = practise(ni, history, seed);
        if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
        const exercise = selection.exercise;
        const kind = selection.prompt as keyof typeof PRODUCTION_ROLES;
        const { role, ...shape } = PRODUCTION_ROLES[kind];
        expect(role).toBe('practice');
        expect(exercise).toMatchObject(shape);
        expect(isTypedAnswerExercise(exercise)).toBe(true);
        expect(exercise.accepted?.map((entry) => entry.id)).toContain(ni.id);
        expect(ratingTaskOf(wordItem(ni), exercise)).toBeNull();
        const text = exercise.rubric.id === 'typed-pinyin' ? 'ni3 hao3' : exercise.rubric.id === 'typed-characters' ? '你好' : 'hola';
        const grade = gradeTypedAnswer(exercise, text)!;
        expect(grade.evaluation).toEqual({ outcome: 'correct' });
        const result = evaluateAttempt(
          { id: `typed-${seed}`, itemId: wordItem(ni), actions: [{ type: 'answer', at: 2_000, answer: text, selectedOptionId: null, evaluation: grade.evaluation }] },
          exercise,
          { sessionMode: 'today', scheduledEligible: true, alreadyKnownCheck: false },
        );
        expect(result).toMatchObject({ kind: 'practice', reason: 'exercise', evaluation: { outcome: 'correct' } });
      }
    }
  });

  it('never builds a typed audio kind without speech, and records why', () => {
    // Listening was never seen, so the audio kinds come first among equals.
    const history = settled(['meaning', 'production', 'tones']);
    let skippedAudio = false;
    for (const seed of SEEDS) {
      const selection = practise(ni, history, seed, { speechAvailable: false });
      if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
      expect(selection.exercise.cue).not.toBe('audio');
      expect(selection.exercise.audio).toBeNull();
      for (const skip of selection.skipped) {
        if (skip.prompt === 'characters-from-audio' || skip.prompt === 'gloss-from-audio') {
          expect(skip.reason).toBe('speech-unavailable');
          skippedAudio = true;
        }
      }
    }
    expect(skippedAudio).toBe(true);
  });

  it('never asks a function word from its gloss, or for its gloss, as a typed answer (P7)', () => {
    let skipped = 0;
    for (const history of [settled(['meaning', 'tones', 'listening']), settled(['meaning', 'tones', 'production'])]) {
      for (const seed of SEEDS) {
        const selection = practise(de, history, seed);
        if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
        expect(['pinyin-from-gloss', 'gloss-from-audio']).not.toContain(selection.prompt);
        expect(selection.exercise.cue).not.toBe('gloss');
        skipped += selection.skipped.filter((skip) => skip.reason === 'function-word').length;
      }
    }
    expect(skipped).toBeGreaterThan(0);
  });

  it('gives the same typed exercise for the same seed', () => {
    const run = (seed: number) => practise(ni, settled(), seed);
    expect(run(11)).toEqual(run(11));
  });
});

describe('writing stages', () => {
  const ren = hsk1Characters.find((character) => character.character === '人')!;
  const itemId = 'character-writing:char-4eba' as ItemId;
  const content = { kind: 'character' as const, character: ren };

  it('teaches strokes with an exposure card', () => {
    expect(selectExercise(card(itemId, 'teach', 'new'), content, context())).toMatchObject({
      kind: 'exposure',
      content: contentReferenceForCharacter(ren),
      card: { reason: 'teaching', answer: { characters: '人', pinyin: ren.pinyin } },
    });
  });

  it('practises by tracing, which does not rate', () => {
    const exercise = exerciseOf(selectExercise(card(itemId, 'practice', 'seen'), content, context()));
    expect(exercise).toMatchObject({ skill: 'writing', format: 'writing', stage: 'trace', cue: 'characters', rubric: { id: 'writing-trace', revision: STROKE_RUBRIC_REVISION } });
    expect(ratingTaskOf(itemId, exercise)).toBeNull();
  });

  it('reviews by drawing from memory, the rating task', () => {
    const selection = selectExercise(card(itemId, 'scheduled', 'due-review'), content, context());
    const exercise = exerciseOf(selection);
    expect(exercise).toMatchObject({ skill: 'writing', format: 'writing', stage: 'memory', cue: 'gloss', grading: 'automatic', rubric: { id: 'writing-from-memory', revision: STROKE_RUBRIC_REVISION } });
    expect(exercise.prompt).toContain(exercise.answer!.meaning);
    expect(ratingTaskOf(itemId, exercise)).toBe('writing');
    const result = evaluateAttempt(
      { id: 'w1', itemId, actions: [{ type: 'drawing', at: 2_000, mistakes: 1, evaluation: { outcome: 'correct' } }] },
      exercise,
      { sessionMode: 'strokes', scheduledEligible: true, alreadyKnownCheck: false },
    );
    expect(result).toMatchObject({ kind: 'scheduled-review', rating: 'hard' });
  });

  it('rejects a character that is not the item', () => {
    expect(() => selectExercise(card('character-writing:char-4e00', 'scheduled'), content, context())).toThrow();
  });
});
