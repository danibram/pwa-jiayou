import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { planDraft, snapshotRevision } from './content-publish.mjs';
import { parseMeaning } from './word-senses.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.tongtong.app';
const text = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
export const reading = (value) => value.normalize('NFC').toLowerCase().replace(/[\s'’·-]/g, '');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
};
const save = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, json(value));
  await rename(temp, path);
};

export function dictionaryUrl(href, base = ORIGIN) {
  const url = new URL(href, base);
  if (url.origin !== ORIGIN || !url.pathname.startsWith('/es/dictionary/')) {
    throw new Error(`Enlace fuera del diccionario español: ${url.href}`);
  }
  if ([...url.searchParams.keys()].some((key) => key !== 'page')) {
    throw new Error(`Parámetro no permitido: ${url.href}`);
  }
  url.hash = '';
  return url.href;
}

function documentFor(html) {
  const dom = new JSDOM(html);
  if (dom.window.document.documentElement.lang !== 'es') {
    dom.window.close();
    throw new Error('La página no está en español.');
  }
  return dom;
}

export function parseList(html, url) {
  const dom = documentFor(html);
  try {
    const doc = dom.window.document;
    const entries = [...doc.querySelectorAll('a[href]')].flatMap((anchor) => {
      const chinese = anchor.querySelector(':scope > [lang="zh-Hans"]');
      if (!chinese) return [];
      const pinyin = chinese.nextElementSibling;
      const definition = pinyin?.nextElementSibling;
      const entry = {
        simplified: text(chinese), pinyin: text(pinyin), definition: text(definition),
        url: dictionaryUrl(anchor.getAttribute('href'), url),
      };
      if (!entry.pinyin || !entry.definition || !/^\p{Script=Han}+$/u.test(entry.simplified)) {
        throw new Error(`Entrada incompleta en ${url}`);
      }
      return [entry];
    });
    if (!entries.length) throw new Error(`No se encontraron entradas en ${url}`);
    const nextLink = [...doc.querySelectorAll('nav[aria-label="Paginación"] a[href]')]
      .find((anchor) => text(anchor).startsWith('Siguiente'));
    const next = nextLink ? dictionaryUrl(nextLink.getAttribute('href'), url) : null;
    if (next && (new URL(next).pathname !== new URL(url).pathname ||
      Number(new URL(next).searchParams.get('page')) !== Number(new URL(url).searchParams.get('page') ?? 1) + 1)) {
      throw new Error(`Paginación inesperada en ${url}`);
    }
    return { entries, next };
  } finally { dom.window.close(); }
}

export function parseEntry(html, expected) {
  const dom = documentFor(html);
  try {
    const doc = dom.window.document;
    const term = [...doc.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent)).find((item) => item['@type'] === 'DefinedTerm');
    const pinyin = text(doc.querySelector('article aside [lang="zh-Hans"] + div span'));
    if (!term || term.name !== expected.simplified || reading(pinyin) !== reading(expected.pinyin)) {
      throw new Error(`La ficha no coincide con ${expected.simplified} (${expected.pinyin}).`);
    }
    if (typeof term.description !== 'string' || !term.description.trim()) {
      throw new Error(`La ficha no tiene definición: ${expected.url}`);
    }
    const section = [...doc.querySelectorAll('h2')].find((h) => text(h) === 'Ejemplos')?.closest('section');
    const examples = [...(section?.querySelectorAll('li') ?? [])].map((li) => {
      const chinese = text(li.querySelector('[lang="zh-Hans"]'));
      const lines = [...li.children];
      const pinyin = text(lines[1]);
      const spanish = text(lines[2]);
      if (!chinese || !pinyin || !spanish || !chinese.includes(expected.simplified) || lines.length !== 3) {
        throw new Error(`Ejemplo incompleto o inesperado: ${expected.url}`);
      }
      return { chinese, pinyin, spanish };
    });
    const relations = [];
    const labels = { 'Sinónimos': 'synonym', 'Antónimos': 'antonym', 'Palabras relacionadas': 'related', 'Clasificadores': 'classifier' };
    for (const heading of doc.querySelectorAll('h2, h3, span')) {
      const kind = labels[text(heading)];
      if (!kind) continue;
      const container = heading.tagName === 'SPAN' ? heading.parentElement.nextElementSibling : heading.nextElementSibling;
      for (const anchor of container?.querySelectorAll('a[href]') ?? []) {
        const simplified = text(anchor.querySelector('[lang="zh-Hans"], .font-chinese'));
        const pinyin = text(anchor.querySelector('.italic'));
        if (!simplified || !pinyin) continue;
        const href = anchor.getAttribute('href').replace(/^\/dictionary\//, '/es/dictionary/');
        relations.push({ kind, simplified, pinyin, url: dictionaryUrl(href, expected.url) });
      }
    }
    return { ...expected, definition: term.description.trim(), examples, relations };
  } finally { dom.window.close(); }
}

export function addDetailsToDraft(draft, details) {
  const references = {};
  const changes = [];
  const unresolved = [];
  const words = draft.snapshot.vocabulary;
  const add = (from, to, kind, url) => {
    if (from.id === to.id || from.relations?.some((link) => link.kind === kind && link.id === to.id)) return;
    from.relations = [...(from.relations ?? []), { kind, id: to.id }];
    changes.push({ word: from.simplified, kind, target: to.simplified, url });
  };
  for (const detail of details) {
    const word = words.find((word) => word.id === detail.wordId);
    if (!word) continue;
    references[word.id] = { url: detail.url, retrieved: detail.retrieved, examples: detail.examples };
    for (const relation of detail.relations) {
      const targets = words.filter((word) => word.simplified === relation.simplified && reading(word.pinyin) === reading(relation.pinyin));
      if (targets.length !== 1) { unresolved.push({ word: word.simplified, ...relation }); continue; }
      add(word, targets[0], relation.kind, detail.url);
      if (relation.kind !== 'classifier') add(targets[0], word, relation.kind, detail.url);
    }
  }
  draft.references = references;
  return { changes, unresolved };
}

export const cacheKey = (url) => `${createHash('sha256').update(url).digest('hex')}.json`;

export function createClient({ cacheDir, offline = false, refresh = false, delay = 30_000,
  fetchImpl = fetch, wait = sleep, now = Date.now, log = console.log }) {
  if (delay < 30_000) throw new Error('TongTong pide al menos 30 segundos entre peticiones.');
  let nextRequest = 0;
  return async (input) => {
    const url = dictionaryUrl(input);
    const path = join(cacheDir, cacheKey(url));
    if (!refresh) {
      const cached = await readJson(path, null);
      if (cached?.url === url && typeof cached.html === 'string') return cached;
    }
    if (offline) throw new Error(`Falta en la caché: ${url}`);
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      await wait(Math.max(0, nextRequest - now()));
      // The timestamp also spaces requests across interrupted CLI runs.
      const state = await readJson(join(cacheDir, 'request-state.json'), { nextRequest: 0 });
      await wait(Math.max(0, state.nextRequest - now()));
      nextRequest = now() + delay;
      await save(join(cacheDir, 'request-state.json'), { nextRequest });
      log(`Descargando ${url}`);
      let response;
      try {
        response = await fetchImpl(url, {
          headers: { 'User-Agent': 'JiayouDictionaryImporter/1.0', 'Accept-Language': 'es' },
          signal: AbortSignal.timeout(30_000), redirect: 'error',
        });
        if (response.ok) {
          const result = { url, retrieved: new Date(now()).toISOString(), html: await response.text() };
          await save(path, result);
          return result;
        }
      } catch (error) { lastError = error; continue; }
      lastError = new Error(`HTTP ${response.status} en ${url}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
      const retry = response.headers.get('retry-after');
      const retryMs = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry ?? '') - now();
      nextRequest = Math.max(nextRequest, now() + (Number.isFinite(retryMs) ? retryMs : delay));
      await save(join(cacheDir, 'request-state.json'), { nextRequest });
    }
    throw lastError;
  };
}

export function matchEntry(entries, simplified, pinyin) {
  const matches = entries.filter((entry) => entry.simplified === simplified && reading(entry.pinyin) === reading(pinyin));
  const unique = [...new Map(matches.map((entry) => [entry.url, entry])).values()];
  return unique.length === 1 ? unique[0] : null;
}

export function proposeTranslations(base, entries, levels) {
  const snapshot = structuredClone(base);
  const changes = [];
  const unmatched = [];
  for (const [kind, rows] of [['word', snapshot.vocabulary], ['character', snapshot.characters]]) {
    for (const row of rows) {
      const level = kind === 'word' ? row.level : row.hsk_level;
      if (!levels.includes(level)) continue;
      const simplified = kind === 'word' ? row.simplified : row.character;
      const entry = matchEntry(entries, simplified, row.pinyin);
      if (!entry) { unmatched.push({ kind, simplified, pinyin: row.pinyin, level }); continue; }
      // A word proposal arrives as uses; parts of speech TongTong names come along, the rest are set in the editor.
      const before = kind === 'word' ? { senses: row.senses } : { definition: row.definition, gloss: row.gloss };
      const after = kind === 'word' ? { senses: parseMeaning(entry.definition) } : {
        definition: entry.definition, gloss: entry.definition.split(/[;；]/)[0].trim(),
      };
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      changes.push({ kind, simplified, pinyin: row.pinyin, level, before, after, url: entry.url });
      Object.assign(row, after);
    }
  }
  return { draft: { schemaVersion: 1, baseRevision: snapshotRevision(base), snapshot }, changes, unmatched };
}

const help = `Uso: npm run scrape-tongtong -- [opciones]

  --levels 1,2,3,4,5,6          Listas de TongTong que se descargan
  --translation-levels 4,5,6   Niveles locales de palabras y caracteres que se comparan
  --example-levels 2,3,4,5,6   Niveles locales para consultar frases y relaciones
  --details-per-level 5       Máximo de fichas por nivel; 0 omite las fichas
  --examples-per-level 5      Alias de --details-per-level
  --max-pages 0               Máximo de páginas por lista; 0 recorre todas
  --cache-dir .cache/tongtong HTML y fechas para reanudar sin repetir descargas
  --out .cache/tongtong/output Informe, borrador del editor y frases propuestas
  --offline                   Solo usa la caché
  --refresh                   Vuelve a descargar las páginas
  --help                      Muestra esta ayuda

Las traducciones y relaciones quedan en draft.json para revisarlas en el editor.
Las frases de la fuente son referencias del borrador y no se publican.
Las descargas esperan al menos 30 segundos entre peticiones. Ejecuta un solo proceso.
`;

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    levels: { type: 'string', default: '1,2,3,4,5,6' },
    'translation-levels': { type: 'string', default: '4,5,6' },
    'example-levels': { type: 'string', default: '2,3,4,5,6' },
    'examples-per-level': { type: 'string' },
    'details-per-level': { type: 'string' },
    'max-pages': { type: 'string', default: '0' },
    'cache-dir': { type: 'string', default: '.cache/tongtong' },
    out: { type: 'string', default: '.cache/tongtong/output' },
    offline: { type: 'boolean' }, refresh: { type: 'boolean' },
    help: { type: 'boolean' },
  } });
  if (values.help) { console.log(help); return; }
  if (values.offline && values.refresh) throw new Error('--offline y --refresh son incompatibles.');
  if (values['details-per-level'] !== undefined && values['examples-per-level'] !== undefined) throw new Error('Usa solo --details-per-level.');
  values['details-per-level'] ??= values['examples-per-level'] ?? '5';
  const levels = (name) => {
    if (!/^[1-6](,[1-6])*$/.test(values[name])) throw new Error(`Niveles inválidos en --${name}`);
    return [...new Set(values[name].split(',').map(Number))];
  };
  const count = (name) => {
    if (!/^\d+$/.test(values[name]) || !Number.isSafeInteger(Number(values[name]))) throw new Error(`Número inválido en --${name}`);
    return Number(values[name]);
  };
  const sourceLevels = levels('levels');
  const translationLevels = levels('translation-levels');
  const exampleLevels = levels('example-levels');
  const maxPages = count('max-pages');
  const perLevel = count('details-per-level');
  const out = resolve(ROOT, values.out);
  const client = createClient({ cacheDir: resolve(ROOT, values['cache-dir']), offline: values.offline, refresh: values.refresh });
  const base = await readJson(join(ROOT, 'content/snapshot.json'));
  const entries = new Map();
  const report = { source: ORIGIN, generated: new Date().toISOString(), sourceLevels, translationLevels,
    exampleLevels, pages: [], errors: [], exampleCounts: {}, missingExamples: [], changes: [], unmatched: [] };
  const examples = {};
  const provenance = {};
  const details = [];
  let fatal;
  try {
    for (const level of sourceLevels) {
      let url = `${ORIGIN}/es/dictionary/hsk/${level}`;
      let page = 0;
      while (url && (!maxPages || page < maxPages)) {
        const cached = await client(url);
        const parsed = parseList(cached.html, url);
        for (const entry of parsed.entries) entries.set(entry.url, entry);
        report.pages.push({ url, retrieved: cached.retrieved, entries: parsed.entries.length, next: parsed.next });
        url = parsed.next;
        page++;
      }
    }
    for (const level of exampleLevels) {
      let added = 0;
      const words = base.vocabulary.filter((row) => row.level === level);
      for (const word of words) {
        if (added >= perLevel) break;
        const entry = matchEntry([...entries.values()], word.simplified, word.pinyin);
        if (!entry) continue;
        const cached = await client(entry.url);
        const detail = parseEntry(cached.html, entry);
        details.push({ ...detail, wordId: word.id, retrieved: cached.retrieved });
        added++;
        const example = detail.examples[0];
        if (!example) { report.missingExamples.push(entry.url); continue; }
        examples[word.simplified] = { chinese: example.chinese, spanish: example.spanish };
        provenance[word.simplified] = { url: entry.url, retrieved: cached.retrieved, pinyin: example.pinyin, level };
      }
      report.exampleCounts[level] = { requested: perLevel, added };
    }
  } catch (error) {
    fatal = error;
    report.errors.push(error.message);
  }
  const proposals = proposeTranslations(base, [...entries.values()], translationLevels);
  const relations = addDetailsToDraft(proposals.draft, details);
  report.relationChanges = relations.changes;
  report.unresolvedRelations = relations.unresolved;
  report.changes = proposals.changes;
  report.unmatched = proposals.unmatched;
  report.incomplete = !!fatal || report.pages.some((page) => page.next && !report.pages.some((other) => other.url === page.next));
  try { await planDraft(proposals.draft); }
  catch (error) {
    fatal = error;
    report.errors.push(error.message);
    report.incomplete = true;
  }
  await save(join(out, 'report.json'), report);
  await save(join(out, 'draft.json'), proposals.draft);
  await save(join(out, 'examples.json'), examples);
  await save(join(out, 'example-sources.json'), provenance);
  console.log(`${entries.size} entradas, ${proposals.changes.length} propuestas de traducción, ${relations.changes.length} relaciones y ${details.length} fichas de referencia. Informe en ${out}`);
  if (fatal) throw fatal;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
