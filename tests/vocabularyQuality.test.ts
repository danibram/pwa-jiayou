import { describe, expect, it } from 'vitest';
import { vocabulary, vocabularyByLevel } from '../src/data/vocabulary';
import { topics } from '../src/data/topics';

// Words whose pinyin keeps a capital: places, continents and festivals.
const properNouns = new Set([
  '北京', '中国', '长城', '长江', '亚洲', '欧洲', '端午节', '元宵节', '重阳节', '国庆节', '黄河', '上海',
]);

/** An ID-like token (letters mixed with digits) or an all-caps machine gloss. */
const looksLikeJunk = (meaning: string) =>
  meaning.split(/[\s;,()]+/).some((token) => token.length >= 6 && /\d/.test(token) && /[a-z]/i.test(token)) ||
  /^[A-ZÁÉÍÓÚÑ ]{6,}$/.test(meaning);

describe('vocabulary quality', () => {
  it('has no junk or untranslated glosses', () => {
    const junk = vocabulary.filter((entry) => looksLikeJunk(entry.meaning));
    expect(junk.map((entry) => `${entry.simplified}: ${entry.meaning}`)).toEqual([]);
  });

  it('keeps dictionary notes out of glosses', () => {
    const notes = [
      /[\u4e00-\u9fff]/, // hanzi inside a Spanish gloss
      /\((préstamo|palabra prestada)\)/i,
      /\bopuesto:/i,
      /\b(abbr|variant|variante de|see|cf\.|lit\.)\b/i,
      /(…|\.\.\.)$/,
      /:/,
    ];
    const leaked = vocabulary.filter((entry) => notes.some((pattern) => pattern.test(entry.meaning)));
    expect(leaked.map((entry) => `${entry.simplified}: ${entry.meaning}`)).toEqual([]);
  });

  it('balances parentheses and never repeats a sense in them', () => {
    const broken = vocabulary.filter((entry) => {
      const opens = (entry.meaning.match(/\(/g) ?? []).length;
      const closes = (entry.meaning.match(/\)/g) ?? []).length;
      const repeated = entry.meaning.match(/^(.+?)\s*\((.+?)\)$/);
      return opens !== closes || (!!repeated && repeated[1].trim().toLowerCase() === repeated[2].trim().toLowerCase());
    });
    expect(broken.map((entry) => `${entry.simplified}: ${entry.meaning}`)).toEqual([]);
  });

  it('starts a noun gloss with the noun, not an article', () => {
    // Fixed phrases where the article is part of the Spanish expression.
    const phrases = new Set([
      '去年', '最', '一会儿', '一点儿', '稍微', '对方', '所谓', '一旦', '再三', '供不应求', '片刻', '群众', '人家', '四肢', '往事', '未免',
    ]);
    const withArticle = vocabulary.filter(
      (entry) => !phrases.has(entry.simplified) && /^(un|una|el|la|los|las|unos|unas) /i.test(entry.meaning),
    );
    expect(withArticle.map((entry) => `${entry.simplified}: ${entry.meaning}`)).toEqual([]);
  });

  it('uses the natural first sense for words learners meet early', () => {
    const meaning = (simplified: string) => vocabulary.find((entry) => entry.simplified === simplified)?.meaning;
    expect(meaning('原谅')).toBe('perdonar');
    expect(meaning('理想')).toBe('ideal');
    expect(meaning('直接')).toBe('directo');
    expect(meaning('特点')).toBe('característica');
    expect(meaning('咖啡')).toBe('café');
  });

  it('keeps glosses short enough for a card', () => {
    const long = vocabulary.filter((entry) => entry.meaning.length > 80);
    expect(long.map((entry) => entry.simplified)).toEqual([]);
  });

  it('writes pinyin in lowercase except for proper nouns', () => {
    const capitalised = vocabulary.filter(
      (entry) => !properNouns.has(entry.simplified) && /[A-ZĀÁǍÀĒÉĚÈŌÓǑÒŪÚǓÙ]/.test(entry.pinyin),
    );
    expect(capitalised.map((entry) => `${entry.simplified} ${entry.pinyin}`)).toEqual([]);
    expect(vocabulary.filter((entry) => entry.pinyin.includes('u:')).map((entry) => entry.simplified)).toEqual([]);
  });

  it('uses the common HSK reading for frequent polyphones', () => {
    const reading = (simplified: string) =>
      vocabulary.find((entry) => entry.simplified === simplified && entry.level <= 3)?.pinyin;
    expect(reading('读')).toBe('dú');
    expect(reading('都')).toBe('dōu');
    expect(reading('还')).toBe('hái');
    expect(reading('听')).toBe('tīng');
    expect(reading('便宜')).toBe('pián yi');
    expect(reading('中国')).toBe('Zhōng guó');
  });

  it('gives every topic at least three HSK 1–2 words', () => {
    const early = [...vocabularyByLevel[1], ...vocabularyByLevel[2]];
    const thin = topics
      .map((topic) => ({ id: topic.id, count: early.filter((entry) => entry.topicIds.includes(topic.id)).length }))
      .filter((row) => row.count < 3);
    expect(thin).toEqual([]);
  });

  it('tags the HSK 1 numbers as Números', () => {
    const numbers = vocabularyByLevel[1].filter((entry) => entry.topicIds.includes('numeros')).map((entry) => entry.simplified);
    expect(numbers).toEqual(expect.arrayContaining(['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '零']));
  });
  it('does not repeat the pinyin as the gloss', () => {
    // Loanwords Spanish uses as they are, and 妈妈, whose gloss only sounds like its pinyin.
    const loanwords = new Set(['妈妈', '元', '饺子', '人民币', '旗袍', '气功']);
    const bare = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
    const echoes = vocabulary.filter((entry) => {
      if (loanwords.has(entry.simplified)) return false;
      const pinyin = bare(entry.pinyin);
      const first = entry.meaning.split(/[;(]/)[0];
      const paren = /^\s*\(([^)]*)\)/.exec(entry.meaning);
      return bare(first) === pinyin || (paren !== null && bare(paren[1]) === pinyin);
    });
    expect(echoes.map((entry) => `${entry.simplified}: ${entry.meaning}`)).toEqual([]);
  });

  it('answers the Spanish words learners search for', () => {
    const gloss = (word: string) => vocabularyByLevel[1].find((entry) => entry.simplified === word)?.meaning ?? '';
    expect(gloss('对不起')).toContain('perdón');
    expect(gloss('没关系')).toContain('no pasa nada');
    expect(gloss('再见')).toContain('hasta luego');
  });
});
