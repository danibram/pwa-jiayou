import { describe, expect, it } from 'vitest';
import { contentReferenceForCharacter, contentReferenceForWord } from '../../../src/domain/learning/content/revision';
import { evaluateAttempt, evaluatorVersion } from '../../../src/domain/learning/evaluation';
import { ratingTaskOf } from '../../../src/domain/learning/evaluation/rules';
import {
  buildOptions,
  displayGloss,
  isFunctionWord,
  selectExercise,
  seededRandom,
  sharesSense,
  soundsSame,
  type ExerciseSelection,
  type WordEntry,
} from '../../../src/domain/learning/exercises';
import { isFunctionWord as legacyIsFunctionWord } from '../../../src/domain/vocabulary/sessionDeck';
import type { VocabularyEntry } from '../../../src/data/vocabulary';
import type { AttemptAction, Exercise, ItemId } from '../../../src/domain/learning/types';
import { ambiguityCases } from '../fixtures/contentCases';
import { SEEDS, card, context, hsk1Characters, settled, vocabulary, word, wordItem } from './fixtures';

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

  it('builds the same card for an already-known check, which rates as already-known', () => {
    const exercise = exerciseOf(selectExercise(card(wordItem(ni), 'already-known-check', 'claimed-known'), { kind: 'word', word: ni }, context()));
    expect(exercise).toMatchObject({ skill: 'meaning', format: 'free-recall', cue: 'characters', grading: 'self-assessment' });
    const result = evaluateAttempt(
      { id: 'a2', itemId: wordItem(ni), actions: selfRated },
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
  it('matches the isFunctionWord rule of the current session deck on the whole catalog', () => {
    for (const entry of vocabulary) {
      expect(isFunctionWord(entry), entry.id).toBe(legacyIsFunctionWord(entry as unknown as VocabularyEntry));
    }
  });

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
    // Meaning and production were seen recently, so listening comes first.
    const recentEvidence = settled(['meaning', 'production', 'meaning']);
    const selection = selectExercise(card(wordItem(ni), 'practice'), { kind: 'word', word: ni }, context({ speechAvailable: false, recentEvidence }));
    if (selection.kind !== 'exercise') throw new Error('Expected an exercise');
    expect(selection.skipped[0]).toEqual({ prompt: expect.stringMatching(/^(hear|listen)$/), reason: 'speech-unavailable' });
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
            context({ recentEvidence: settled(['meaning', 'production', 'meaning']), familiar: (id) => partners.has(id) }, seed),
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
        const selection = selectExercise(card(wordItem(entry), 'practice'), { kind: 'word', word: entry }, context({ recentEvidence: settled(['meaning', 'production', 'meaning']) }, seed));
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
    // Listening and meaning were seen recently; production was not.
    const recentEvidence = settled(['listening', 'meaning', 'listening']);
    for (const seed of SEEDS) {
      const exercise = exerciseOf(selectExercise(card(wordItem(ni), 'practice', 'seen'), { kind: 'word', word: ni }, context({ recentEvidence }, seed)));
      expect(exercise.skill).toBe('production');
    }
  });

  it('reaches free-recall formats once the word is settled', () => {
    const prompts = new Set(
      SEEDS.map((seed) => {
        // Production is the skill seen longest ago, so reverse and pick share the first place.
        const recentEvidence = settled(['production', 'meaning', 'listening']);
        const selection = selectExercise(card(wordItem(ni), 'practice', 'seen'), { kind: 'word', word: ni }, context({ recentEvidence }, seed));
        return selection.kind === 'exercise' ? selection.prompt : 'exposure';
      }),
    );
    expect(prompts).toEqual(new Set(['reverse', 'pick']));
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
    expect(exercise).toMatchObject({ skill: 'writing', format: 'writing', stage: 'trace', cue: 'characters', rubric: { id: 'writing-trace' } });
    expect(ratingTaskOf(itemId, exercise)).toBeNull();
  });

  it('reviews by drawing from memory, the rating task', () => {
    const selection = selectExercise(card(itemId, 'scheduled', 'due-review'), content, context());
    const exercise = exerciseOf(selection);
    expect(exercise).toMatchObject({ skill: 'writing', format: 'writing', stage: 'memory', cue: 'gloss', grading: 'automatic', rubric: { id: 'writing-from-memory' } });
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
