import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, extractRows } from './compare-hsk3-pdf.mjs';

test('extracts split hanzi and keeps repeated entries and continuation text', () => {
  const result = extractRows('Hanzi Pinyin English Spanish\n电子邮\n件\ndiànzǐyóujiàn  email  correo electrónico\n还 hái still todavía\n还 huán return volver\ncontinuation');
  assert.deepEqual(result.rows.map((row) => row.word), ['电子邮件', '还', '还']);
  assert.match(result.rows[2].source, /continuation/);
  assert.deepEqual(result.unresolved, []);
});

test('compares levels and missing characters without changing entries', () => {
  const rows = [{ word: '爱', source: '爱 ài love amar' }, { word: '缺字', source: '缺字' }, { word: '高', source: '高 gāo' }];
  const catalog = [{ id: 'a', simplified: '爱', level: 1, pinyin: 'ài', meaning: 'amar' }, { id: 'b', simplified: '高', level: 4, pinyin: 'gāo', meaning: 'alto' }];
  const result = compare(rows, catalog, { 爱: 1, 高: 2, 字: 1 });
  assert.deepEqual(result.map((row) => row.status), ['found', 'missing', 'outside-hsk1-3']);
  assert.deepEqual(result[1].missingCharacters, ['缺']);
  assert.equal(result[0].entries[0].meaning, 'amar');
});

test('extracts Spanish and joins wrapped translations in layout text', () => {
  const row = (word, pinyin, english, spanish) => word.padEnd(16) + pinyin.padEnd(20) + english.padEnd(24) + spanish;
  const input = [
    row('Hanzi', 'Pinyin', 'English', 'Spanish'),
    row('爱', 'ài', 'love', 'amar'),
    row('被', 'bèi', 'quilt; particle for', 'colcha; partícula para'),
    row('', '', 'passive voice', 'voz pasiva'),
  ].join('\n');
  const extracted = extractRows(input);
  assert.equal(extracted.rows.length, 2);
  assert.equal(extracted.rows[0].sourceSpanish, 'amar');
  assert.equal(extracted.rows[1].sourceSpanish, 'colcha; partícula para voz pasiva');
  const matched = compare(extracted.rows, [], {});
  assert.equal(matched[1].sourceSpanish, 'colcha; partícula para voz pasiva');
});
