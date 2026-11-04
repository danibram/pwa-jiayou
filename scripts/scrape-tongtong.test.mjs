import assert from 'node:assert/strict';
import { parseMeaning } from './word-senses.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { addDetailsToDraft, createClient, dictionaryUrl, matchEntry, parseEntry, parseList,
  proposeTranslations } from './scrape-tongtong.mjs';

const url = 'https://www.tongtong.app/es/dictionary/hsk/4';
const entry = { simplified: '棒', pinyin: 'bàng', definition: 'palo; excelente',
  url: 'https://www.tongtong.app/es/dictionary/%E6%A3%92-bang' };
const list = `<html lang="es"><a href="/es/dictionary/棒-bang"><span lang="zh-Hans">棒</span>
  <span>bàng</span><span>palo; excelente</span><span>HSK 4</span></a>
  <nav aria-label="Paginación"><a href="/es/dictionary/hsk/4?page=2">Siguiente →</a></nav></html>`;
const detail = `<html lang="es"><script type="application/ld+json">${JSON.stringify({
  '@type': 'DefinedTerm', name: '棒', description: 'palo; excelente',
})}</script><article><aside><div lang="zh-Hans">棒</div><div><span>bàng</span></div></aside>
  <section><h2>Ejemplos</h2><ul><li><div><span lang="zh-Hans"><button>你</button><span>真棒</span>！</span>
  <button aria-label="Reproducir pronunciación"></button></div><div>Nǐ zhēn bàng!</div>
  <div>¡Lo haces muy bien!</div></li></ul></section></article></html>`;

test('reads list definitions and follows pagination without guessing slugs', () => {
  assert.deepEqual(parseList(list, url), { entries: [entry], next: `${url}?page=2` });
  assert.equal(parseList(list.replace(/<nav[\s\S]*<\/nav>/, ''), url).next, null);
  assert.throws(() => parseList(list.replace('page=2', 'page=1'), url), /Paginación/);
});

test('rejects missing content, wrong locale and external links', () => {
  assert.throws(() => parseList('<html lang="es">Error</html>', url), /entradas/);
  assert.throws(() => parseList(list.replace('lang="es"', 'lang="en"'), url), /español/);
  assert.throws(() => dictionaryUrl('https://example.com/es/dictionary/test'), /fuera/);
  assert.throws(() => dictionaryUrl(`${url}?q=棒`), /Parámetro/);
});

test('reads segmented Chinese sentences, pinyin and Spanish independently', () => {
  assert.deepEqual(parseEntry(detail, entry).examples, [
    { chinese: '你真棒！', pinyin: 'Nǐ zhēn bàng!', spanish: '¡Lo haces muy bien!' },
  ]);
  assert.throws(() => parseEntry(detail, { ...entry, pinyin: 'bāng' }), /no coincide/);
  assert.throws(() => parseEntry(detail, { ...entry, simplified: '帮' }), /no coincide/);
  assert.throws(() => parseEntry(detail.replace('<div>¡Lo haces muy bien!</div>', ''), entry), /incompleto/);
  assert.throws(() => parseEntry(detail.replace('<span>真棒</span>', '<span>好</span>'), entry), /incompleto/);
});

test('missing example section means no examples, not a manufactured sentence', () => {
  assert.deepEqual(parseEntry(detail.replace(/<section>[\s\S]*<\/section>/, ''), entry).examples, []);
});

test('matches tones and refuses ambiguous entries', () => {
  assert.equal(matchEntry([entry], '棒', 'bàng'), entry);
  assert.equal(matchEntry([entry], '棒', 'bāng'), null);
  assert.equal(matchEntry([entry, { ...entry, url: `${entry.url}-2` }], '棒', 'bàng'), null);
  assert.equal(matchEntry([{ ...entry, pinyin: 'shí jiàn' }], '棒', 'shíjiàn')?.pinyin, 'shí jiàn');
});

test('proposals preserve local levels, IDs, readings and unrelated fields', () => {
  const base = { schemaVersion: 1, topics: [], vocabulary: [
    { id: 'word-bang', simplified: '棒', level: 4, pinyin: 'bàng', senses: [{ text: 'viejo' }] },
    { id: 'word-bang-low', simplified: '棒', level: 2, pinyin: 'bàng', senses: [{ text: 'sin cambios' }] },
  ], characters: [
    { character: '棒', hsk_level: 6, pinyin: 'bàng', gloss: 'viejo', definition: 'viejo', radical: '木' },
    { character: '长', hsk_level: 4, pinyin: 'cháng', gloss: 'largo', definition: 'largo' },
  ] };
  const original = structuredClone(base);
  const result = proposeTranslations(base, [entry], [4, 5, 6]);
  assert.deepEqual(base, original);
  assert.equal(result.changes.length, 2);
  assert.equal(result.unmatched[0].simplified, '长');
  assert.deepEqual(result.draft.snapshot.vocabulary[0], { ...base.vocabulary[0], senses: parseMeaning(entry.definition) });
  assert.deepEqual(result.draft.snapshot.vocabulary[1], base.vocabulary[1]);
  assert.deepEqual(result.draft.snapshot.characters[0], { ...base.characters[0], gloss: 'palo', definition: entry.definition });
  assert.equal(result.draft.baseRevision.length, 64);
});

test('keeps phrases as references and excludes the confusion links already computed by the app', () => {
  const html = detail.replace('</article>', `<div><span>Fácil de confundir</span></div><ul><li><a href="/dictionary/帮-bang"><span class="font-chinese">帮</span><span class="italic">bāng</span></a></li></ul>
    <h2>Sinónimos</h2><ul><li><a href="/dictionary/好-hao"><span lang="zh-Hans">好</span><span class="italic">hǎo</span></a></li></ul></article>`);
  const parsed = parseEntry(html, entry);
  assert.deepEqual(parsed.relations.map((relation) => relation.kind), ['synonym']);
  const example = { chinese: '太棒了。', spanish: 'Estupendo.' };
  const draft = { snapshot: { vocabulary: [
    { id: 'bang', simplified: '棒', pinyin: 'bàng', example },
    { id: 'help', simplified: '帮', pinyin: 'bāng' },
    { id: 'good', simplified: '好', pinyin: 'hǎo' },
  ] } };
  const input = [{ ...parsed, wordId: 'bang', retrieved: '2026-11-04' }];
  const result = addDetailsToDraft(draft, input);
  assert.equal(result.changes.length, 2);
  assert.deepEqual(draft.snapshot.vocabulary[0].example, example);
  assert.deepEqual(draft.references.bang.examples, parsed.examples);
  assert.deepEqual(draft.snapshot.vocabulary[0].relations, [{ kind: 'synonym', id: 'good' }]);
  assert.equal(draft.snapshot.vocabulary[1].relations, undefined);
  assert.equal(addDetailsToDraft(draft, input).changes.length, 0);
  const ambiguous = structuredClone(draft);
  ambiguous.snapshot.vocabulary.push({ id: 'good2', simplified: '好', pinyin: 'hǎo' });
  assert.equal(addDetailsToDraft(ambiguous, input).unresolved.length, 1);
});

test('caches successful pages and supports offline resumption', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'tongtong-'));
  try {
    let calls = 0;
    const client = createClient({ cacheDir, log() {}, fetchImpl: async () => { calls++; return new Response(list); } });
    assert.equal((await client(url)).html, list);
    await client(url);
    assert.equal(calls, 1);
    const offline = createClient({ cacheDir, offline: true });
    assert.equal((await offline(url)).html, list);
    await assert.rejects(offline(`${url}?page=2`), /Falta en la caché/);
  } finally { await rm(cacheDir, { recursive: true, force: true }); }
});

test('honors Retry-After and persisted pacing without caching failed responses', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'tongtong-'));
  try {
    let time = 100_000;
    const waits = [];
    const settings = { cacheDir, log() {}, now: () => time, wait: async (ms) => { waits.push(ms); time += ms; } };
    let calls = 0;
    const client = createClient({ ...settings, fetchImpl: async () => ++calls === 1
      ? new Response('', { status: 429, headers: { 'retry-after': '60' } }) : new Response(list) });
    await client(url);
    assert.ok(waits.includes(60_000));
    const resumed = createClient({ ...settings, fetchImpl: async () => new Response(list) });
    await resumed(`${url}?page=2`);
    assert.ok(waits.includes(30_000));
    const denied = createClient({ ...settings, fetchImpl: async () => new Response('', { status: 403 }) });
    await assert.rejects(denied(`${url}?page=3`), /HTTP 403/);
    await assert.rejects(createClient({ cacheDir, offline: true })(`${url}?page=3`), /Falta en la caché/);
  } finally { await rm(cacheDir, { recursive: true, force: true }); }
});
