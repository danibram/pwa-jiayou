import { describe, expect, it } from 'vitest';
import { sensesText } from '../src/data/wordSenses';
import { vocabulary, vocabularyByLevel } from './fixtures/levelWords';
import {
  vocabularyCoverage,
  officialCounts,
  vocabularySources,
  vocabularyExample,
} from '../src/data/vocabulary';
import sourceFixture from '../src/data/vocabulary/source-fixture.json';
import hsk1 from '../src/data/vocabulary/hsk1.json';
import hsk2 from '../src/data/vocabulary/hsk2.json';
import hsk3 from '../src/data/vocabulary/hsk3.json';
import hsk4 from '../src/data/vocabulary/hsk4.json';
import hsk5 from '../src/data/vocabulary/hsk5.json';
import hsk6 from '../src/data/vocabulary/hsk6.json';
import publishedIds from '../src/data/vocabulary/published-ids.json';
import { wordId } from '../src/utils/pinyin';
import { topics } from '../src/data/topics';

type RawWord = { id: string; simplified: string; pinyin: string };
/** Raw JSON readings, so the expected ids do not depend on runtime tone sandhi. */
const rawWords: RawWord[] = [hsk1, hsk2, hsk3, hsk4, hsk5, hsk6].flat();

const hanziHex = (simplified: string) => [...simplified].map((char) => char.codePointAt(0)!.toString(16));

/** The app's own rule, so the ids the build scripts wrote and the ones it makes for new words agree. */
const expectedId = ({ simplified, pinyin }: RawWord) => wordId(simplified, pinyin);

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
        expect(entry.id.startsWith(`word-${hanziHex(entry.simplified).join('-')}-`)).toBe(true);
        expect(entry.sourceId in vocabularySources).toBe(true);
        expect(sensesText(entry.senses)).toBeTruthy();
        expect(entry.traditional).toBeTruthy();
        expect(entry.characters).toEqual([...entry.simplified]);
      }
    }
  });

  it('derives every word id from the hanzi and the raw reading', () => {
    for (const word of rawWords) expect(word.id, word.simplified).toBe(expectedId(word));
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

describe('published word ids', () => {
  const catalogIds = new Set(rawWords.map((word) => word.id));

  it('keeps every published id in the catalog', () => {
    const gone = publishedIds.filter((id) => !catalogIds.has(id));
    expect(
      gone,
      'Saved progress points at these ids and would be orphaned. Restore the entry or its reading in ' +
        'src/data/vocabulary/hsk*.json; a corrected reading needs a migration of saved progress first. ' +
        'Do not edit published-ids.json to make this pass.',
    ).toEqual([]);
  });

  it('lists every catalog id as published', () => {
    const published = new Set(publishedIds);
    const unlisted = [...catalogIds].filter((id) => !published.has(id));
    expect(
      unlisted,
      'Ids not published yet. For new vocabulary run `npm run published-ids` and commit published-ids.json. ' +
        'If one replaces a published id, fix that failure first.',
    ).toEqual([]);
  });
});
