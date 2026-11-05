import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sensesText, vocabularySources } from '@jiayou/content';
import { vocabulary, vocabularyByLevel } from './fixtures/levelWords';
import {
  extraVocabulary,
  vocabularyCoverage,
  officialCounts,
  vocabularyExample,
} from '../src/data/vocabulary';
import sourceFixture from '../src/data/vocabulary/source-fixture.json';
import hsk1 from '../src/data/vocabulary/hsk1.json';
import hsk2 from '../src/data/vocabulary/hsk2.json';
import hsk3 from '../src/data/vocabulary/hsk3.json';
import hsk4 from '../src/data/vocabulary/hsk4.json';
import hsk5 from '../src/data/vocabulary/hsk5.json';
import hsk6 from '../src/data/vocabulary/hsk6.json';
import extra from '../src/data/vocabulary/extra.json';
import publishedRegistry from '../src/data/vocabulary/published-ids.json';
import { wordId } from '@jiayou/chinese';
import { topics } from '../src/data/topics';
import { parseCharacterList } from '../src/stores/characterStore';
import type { HskLevel } from '../src/types';
import { characterContentId, characterRevision, wordRevision } from '@jiayou/content';
import { listOf, updateRegistry, type ContentRegistry } from '../../../scripts/content-publish.mjs';

type RawWord = (typeof hsk1)[number] & { level?: number; retired?: true };
/** Raw JSON readings, so the expected ids do not depend on runtime tone sandhi. */
const rawWords: RawWord[] = [hsk1, hsk2, hsk3, hsk4, hsk5, hsk6, extra as RawWord[]].flat();
const registry = publishedRegistry as unknown as ContentRegistry;
const revise = { wordRevision, characterRevision, characterContentId };

const hanziHex = (simplified: string) => [...simplified].map((char) => char.codePointAt(0)!.toString(16));

/** The app's own rule, so the ids the build scripts wrote and the ones it makes for new words agree. */
const expectedId = ({ simplified, pinyin }: Pick<RawWord, 'simplified' | 'pinyin'>) => wordId(simplified, pinyin);

/**
 * Ids that break the catalog rule. A published id is permanent and is never checked against the
 * current hanzi or reading, so a corrected entry keeps it. Only a candidate the registry has not
 * published must be wordId(simplified, pinyin), or that id plus the editor's collision suffix
 * (catalogId in editor/lib/store.ts adds -2, -3...).
 */
const unpublishedIdProblems = (rows: readonly RawWord[], published: ContentRegistry) =>
  rows.filter((row) => {
    if (published.words[row.id]) return false;
    const stem = expectedId(row);
    return row.id !== stem && !(row.id.startsWith(`${stem}-`) && /^([2-9]|[1-9]\d+)$/.test(row.id.slice(stem.length + 1)));
  }).map((row) => `${row.simplified} ${row.pinyin}: ${row.id}`);

const rawWordFor = (simplified: string) => {
  const word = rawWords.find((entry) => entry.simplified === simplified);
  if (!word) throw new Error(`No raw entry for ${simplified}`);
  return word;
};

const pilotIds = [
  '爱', '八', '爸爸', '杯子', '北京', '本', '不', '不客气', '菜', '茶',
  '吃', '出租车', '打电话', '大', '的', '点', '电脑', '电视', '电影', '东西',
  '都', '读', '对不起', '多', '多少', '儿子', '二', '飞机', '分钟', '好',
  '喝', '很', '家', '今天', '老师', '妈妈', '明天', '朋友', '谢谢', '学生',
].map((simplified) => expectedId(rawWordFor(simplified)));

describe('HSK 2.0 vocabulary', () => {
  it('keeps the added PDF words and their characters in the catalog', async () => {
    const { default: levels } = await import('../src/data/characterLevels.json');
    for (const simplified of ['饭店', '没有', '哪儿', '那儿', '说', '一点儿', '踢足球', '这儿', '电子邮件', '刮风', '刷牙']) {
      const entry = vocabulary.find((word) => word.simplified === simplified);
      expect(entry, simplified).toBeDefined();
      expect(sensesText(entry?.senses ?? [])).toBeTruthy();
      for (const character of entry?.characters ?? []) expect(character in levels, character).toBe(true);
    }
    expect(vocabularyExample('飞机')).toEqual({ chinese: '我坐飞机去北京。', spanish: 'Voy a Pekín en avión.' });
    const authored = { chinese: '飞机已经到了。', spanish: 'El avión ya ha llegado.' };
    expect(vocabularyExample('飞机', authored)).toEqual(authored);
    expect(vocabularyExample('飞机', null)).toBeUndefined();
    expect(vocabularyExample('八')).toBeUndefined();
    expect(vocabulary.find((entry) => entry.simplified === '号')?.level).toBe(1);
    for (const simplified of ['等', '对', '过', '为什么', '着急', '作业']) {
      expect(vocabulary.find((entry) => entry.simplified === simplified)?.level, simplified).toBe(2);
    }
    expect(vocabulary.filter((entry) => entry.simplified === '还').map((entry) => entry.pinyin)).toEqual(['hái', 'huán']);
    expect(vocabulary.filter((entry) => entry.simplified === '长').map((entry) => entry.pinyin)).toEqual(['cháng', 'zhǎng']);
    expect(sensesText(vocabulary.find((entry) => entry.simplified === '声音')?.senses ?? [])).toContain('sonido');
    expect(sensesText(vocabulary.find((entry) => entry.simplified === '问题')?.senses ?? [])).toContain('problema');
    expect(sensesText(vocabulary.find((entry) => entry.simplified === '送')?.senses ?? [])).toContain('regalar');
    expect(sensesText(vocabulary.find((entry) => entry.simplified === '送')?.senses ?? [])).toContain('enviar');
  });
  it('covers exclusive levels 1–6 with stable identities', () => {
    expect(vocabularyCoverage).toMatchObject({
      edition: 'HSK 2.0',
      complete: true,
      levels: [1, 2, 3, 4, 5, 6],
    });
    const levels = vocabularyCoverage.levels;
    expect(vocabulary).toHaveLength(levels.reduce((sum, level) => sum + vocabularyCoverage.counts[level], 0));
    expect(vocabulary.length).toBeGreaterThanOrEqual(levels.reduce((sum, level) => sum + officialCounts[level], 0));
    expect(new Set(vocabulary.map((entry) => entry.id)).size).toBe(vocabulary.length);
    for (const level of vocabularyCoverage.levels) {
      expect(vocabularyByLevel[level]).toHaveLength(vocabularyCoverage.counts[level]);
      for (const entry of vocabularyByLevel[level]) {
        expect(entry.level).toBe(level);
        // A published id keeps the hanzi it was first published with, even after a correction.
        if (!registry.words[entry.id]) expect(entry.id.startsWith(`word-${hanziHex(entry.simplified).join('-')}-`)).toBe(true);
        expect(entry.sourceId in vocabularySources).toBe(true);
        expect(sensesText(entry.senses)).toBeTruthy();
        expect(entry.traditional).toBeTruthy();
        expect(entry.characters).toEqual([...entry.simplified]);
      }
    }
  });

  it('derives every unpublished word id from the hanzi and the raw reading', () => {
    expect(unpublishedIdProblems(rawWords, registry)).toEqual([]);
    expect(new Set(rawWords.map((word) => word.id)).size).toBe(rawWords.length);
  });

  it('keeps the reading in the id of 嗯', () => {
    expect(vocabulary.find((entry) => entry.simplified === '嗯')?.id).toMatch(/-ng4$/);
  });

  it('keeps pilot word ids and selected source forms', () => {
    for (const id of pilotIds) {
      expect(vocabulary.some((entry) => entry.id === id), id).toBe(true);
    }
    for (const [simplified, traditional, pinyin] of sourceFixture.forms) {
      expect(vocabulary.find((entry) => entry.simplified === simplified)).toMatchObject({
        traditional,
        pinyin,
        level: 1,
      });
    }
    const topicIds = new Set(topics.map((topic) => topic.id));
    for (const entry of vocabularyByLevel[1]) {
      expect(new Set(entry.topicIds).size).toBe(entry.topicIds.length);
      for (const id of entry.topicIds) expect(topicIds.has(id), `${entry.simplified}: ${id}`).toBe(true);
    }
    expect(vocabulary.find((entry) => entry.simplified === '飞机')?.topicIds).toContain('transporte');
    expect(vocabulary.find((entry) => entry.simplified === '东西')?.topicIds).not.toContain('direcciones');
  });

  it('keeps repeated characters and word-specific readings', () => {
    const word = (simplified: string) => vocabulary.find((entry) => entry.simplified === simplified);
    expect(word('爸爸')).toMatchObject({ characters: ['爸', '爸'], pinyin: 'bà ba' });
    expect(word('谢谢')).toMatchObject({ characters: ['谢', '谢'], pinyin: 'xiè xie' });
    expect(word('东西')?.pinyin).toBe('dōng xi');
    expect(word('多少')?.pinyin).toBe('duō shao');
    expect(word('对不起')?.pinyin).toBe('duì bu qǐ');
  });

  it('uses Spanish curated senses for the pilot seed', () => {
    expect(sensesText(vocabulary.find((entry) => entry.simplified === '朋友')?.senses ?? [])).toBe('amigo; amiga');
    expect(sensesText(vocabulary.find((entry) => entry.simplified === '谢谢')?.senses ?? [])).toBe('gracias');
    expect(sensesText(vocabulary.find((entry) => entry.simplified === '北京')?.senses ?? [])).toBe('Pekín');
  });
});

describe('published id registry', () => {
  const catalogIds = new Set(rawWords.map((word) => word.id));
  const entries = Object.entries(registry.words);

  it('keeps every available id in the catalog', () => {
    const gone = entries.filter(([id, entry]) => entry.status === 'available' && !catalogIds.has(id)).map(([id]) => id);
    expect(
      gone,
      'Saved progress points at these ids and would be orphaned. Restore the entry in src/data/vocabulary/*.json, ' +
        'keeping its id even if you corrected its hanzi, reading or senses. To retire it, set retired: true on its row in ' +
        'content/snapshot.json and run `npm run published-ids`. ' +
        'Do not edit published-ids.json to make this pass.',
    ).toEqual([]);
  });

  it('keeps retired ids out of the lists the app reads', () => {
    const listed = entries.filter(([id, entry]) => entry.status === 'retired' && catalogIds.has(id)).map(([id]) => id);
    expect(listed, 'A retired id cannot come back as a listed word. To publish the same entry again, remove retired: true from its row in content/snapshot.json.').toEqual([]);
  });

  it('lists every catalog id as published, under the list that ships it', () => {
    const unlisted = [...catalogIds].filter((id) => !registry.words[id]);
    expect(
      unlisted,
      'Ids not published yet. For new vocabulary run `npm run published-ids` and commit published-ids.json. ' +
        'If one replaces a published id, fix that failure first.',
    ).toEqual([]);
    for (const word of rawWords) expect(registry.words[word.id]?.list, word.id).toBe(listOf(word));
  });

  it('matches the snapshot the editor publishes from', () => {
    const snapshot = JSON.parse(readFileSync('../../content/snapshot.json', 'utf8')) as { vocabulary: RawWord[]; characters: { character: string }[] };
    expect(Object.keys(registry.words).sort()).toEqual(snapshot.vocabulary.map((row) => row.id).sort());
    for (const row of snapshot.vocabulary) expect(registry.words[row.id].status, row.id).toBe(row.retired ? 'retired' : 'available');
    expect(Object.keys(registry.characters).sort()).toEqual(snapshot.characters.map((row) => characterContentId(row.character)).sort());
  });

  it('publishes the revision the app computes for every word and character', () => {
    // Words as the app parses them (reading with tone sandhi), characters as the stroke page reads them.
    const words = [...vocabulary, ...extraVocabulary];
    expect(words).toHaveLength(rawWords.length);
    const stale = words.filter((word) => registry.words[word.id]?.revisions.at(-1) !== wordRevision(word)).map((word) => word.id);
    const characters = [
      ...parseCharacterList(JSON.parse(readFileSync('src/data/hsk1.json', 'utf8')), 1),
      ...([2, 3, 4, 5, 6] as HskLevel[]).flatMap((level) =>
        parseCharacterList(JSON.parse(readFileSync(`public/packs/hsk${level}.json`, 'utf8')), level),
      ),
    ];
    expect(characters).toHaveLength(Object.keys(registry.characters).length);
    for (const character of characters) {
      const id = characterContentId(character.character);
      if (registry.characters[id]?.revisions.at(-1) !== characterRevision(character)) stale.push(id);
    }
    expect(stale, 'Published revisions differ from what the app computes. Run `npm run published-ids` and commit published-ids.json.').toEqual([]);
  });
});

describe('id permanence', () => {
  const ai = rawWords.find((word) => word.id === 'word-7231-ai4')!;
  const hai = rawWords.find((word) => word.id === 'word-8fd8-hai2')!;
  const characters = [{ character: '爱', pinyin: 'ài', definition: 'amar', hsk_level: 1 }];
  const first = updateRegistry(null, { words: [ai, hai], characters }, revise);

  it('keeps the id after a corrected reading or corrected senses', () => {
    const reading = { ...ai, pinyin: 'ǎi' };
    const senses = { ...ai, senses: [{ pos: 'verbo', text: 'querer' }] };
    // The corrected reading no longer derives the id, which is fine once the id is published.
    expect(unpublishedIdProblems([reading], first)).toEqual([]);
    expect(unpublishedIdProblems([reading], updateRegistry(null, { words: [], characters: [] }, revise))).toHaveLength(1);
    let next = first;
    for (const corrected of [reading, senses]) {
      next = updateRegistry(next, { words: [corrected, hai], characters }, revise);
      expect(next.words[ai.id]).toMatchObject({ status: 'available', list: 'hsk1' });
      expect(next.words[ai.id].revisions.at(-1)).toBe(wordRevision(corrected));
    }
    // Every revision stays, oldest first, so attempts made against the old card remain readable.
    expect(next.words[ai.id].revisions).toEqual([wordRevision(ai), wordRevision(reading), wordRevision(senses)]);
  });

  it('keeps id and revision when a word moves between HSK and Extra', () => {
    const { level: _level, ...asExtra } = ai;
    const toExtra = updateRegistry(first, { words: [asExtra as RawWord, hai], characters }, revise);
    expect(toExtra.words[ai.id]).toEqual({ ...first.words[ai.id], list: 'extra' });
    const back = updateRegistry(toExtra, { words: [{ ...ai, level: 3 }, hai], characters }, revise);
    expect(back.words[ai.id]).toEqual({ ...first.words[ai.id], list: 'hsk3' });
  });

  it('keeps a retired id and never lets it go', () => {
    const retired = updateRegistry(first, { words: [{ ...ai, retired: true }, hai], characters }, revise);
    expect(retired.words[ai.id]).toEqual({ ...first.words[ai.id], status: 'retired' });
    // Dropping the row instead of retiring it would free the id for another entry.
    expect(() => updateRegistry(retired, { words: [hai], characters }, revise)).toThrow(/word-7231-ai4/);
    expect(() => updateRegistry(first, { words: [hai], characters }, revise)).toThrow(/Retíralas/);
    // Clearing the retirement publishes the same entry again under its id.
    expect(updateRegistry(retired, { words: [ai, hai], characters }, revise).words[ai.id]).toEqual(first.words[ai.id]);
  });

  it('accepts the editor collision suffix only on unpublished ids', () => {
    const stem = expectedId(ai);
    const empty = updateRegistry(null, { words: [], characters: [] }, revise);
    expect(unpublishedIdProblems([{ ...ai, id: `${stem}-2` }, { ...ai, id: `${stem}-10` }], empty)).toEqual([]);
    expect(unpublishedIdProblems([{ ...ai, id: `${stem}-1` }], empty)).toHaveLength(1);
    expect(unpublishedIdProblems([{ ...ai, id: `${stem}-x` }], empty)).toHaveLength(1);
  });
});
