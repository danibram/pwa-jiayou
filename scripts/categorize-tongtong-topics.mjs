/**
 * Pull TongTong thematic lists and tag our catalog with theme + subtopic ids.
 *
 * Usage:
 *   node scripts/categorize-tongtong-topics.mjs [--offline] [--refresh] [--apply]
 *   node scripts/categorize-tongtong-topics.mjs --warm-cache      # download list pages only
 *   node scripts/categorize-tongtong-topics.mjs --structure-only  # kinds/parents, no TongTong fetch
 *
 * Without --apply: writes report + draft.json (importable in the editor) under .cache/tongtong/topics/.
 * With --apply: also updates vocabulary JSON, topics.ts and content/snapshot.json.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { snapshotRevision } from './content-publish.mjs';
import {
  createClient, parseList, reading,
} from './scrape-tongtong.mjs';
import {
  DEFERRED_THEME_IDS,
  EXISTING_SUBTOPIC_PARENT,
  TAG_IDS,
  THEME_META,
  TONG_LIST_MAP,
  VISIBLE_THEME_IDS,
  listSlugsForThemes,
  subtopicsFromMap,
} from './topic-taxonomy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.tongtong.app';
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const formatCharacters = (chars) => {
  const quoted = chars.map(quote);
  if (quoted.length <= 16) return `[${quoted.join(', ')}]`;
  const lines = [];
  for (let i = 0; i < quoted.length; i += 16) lines.push(`      ${quoted.slice(i, i + 16).join(', ')},`);
  return `[\n${lines.join('\n')}\n    ]`;
};

const topicRow = (topic) => {
  const lines = [
    `    id: ${quote(topic.id)}`,
    `    title: ${quote(topic.title)}`,
    `    glyph: ${quote(topic.glyph)}`,
    `    kind: ${quote(topic.kind)}`,
  ];
  if (topic.parentId) lines.push(`    parentId: ${quote(topic.parentId)}`);
  if (topic.listed === false) lines.push('    listed: false');
  lines.push(`    characters: ${formatCharacters(topic.characters)}`);
  return `  {\n${lines.join(',\n')},\n  },`;
};

export async function writeTopicsFile(topics, root = ROOT) {
  const path = join(root, 'src/data/topics.ts');
  const source = await readFile(path, 'utf8');
  const pattern = /export const topics: Topic\[\] = \[[\s\S]*?\n\];/;
  if (!pattern.test(source)) throw new Error('No se encuentra la lista de temas.');
  const body = `export const topics: Topic[] = [\n${topics.map(topicRow).join('\n')}\n];`;
  await writeFile(path, source.replace(pattern, body));
}

/** Rebuild topic rows: kinds, parents, new subtopics; keep character lists when possible. */
export function rebuildTopics(baseTopics, knownChars, charsBySubtopic = new Map()) {
  const byId = new Map(baseTopics.map((t) => [t.id, structuredClone(t)]));
  const ensureChars = (id, fallback) => {
    const fromMatch = charsBySubtopic.get(id) ?? [];
    const existing = byId.get(id)?.characters ?? [];
    const merged = [...new Set([...fromMatch, ...existing, ...fallback])].filter((c) => knownChars.has(c));
    if (merged.length >= 5) return merged;
    // Borrow from any sibling / parent so validation still passes for empty new topics.
    for (const other of byId.values()) {
      for (const c of other.characters) {
        if (knownChars.has(c) && !merged.includes(c)) merged.push(c);
        if (merged.length >= 5) return merged;
      }
    }
    return merged;
  };

  for (const id of TAG_IDS) {
    const row = byId.get(id);
    if (!row) throw new Error(`Falta la etiqueta ${id}`);
    row.kind = 'tag';
    delete row.parentId;
    delete row.listed;
  }

  for (const id of [...VISIBLE_THEME_IDS, ...DEFERRED_THEME_IDS]) {
    const row = byId.get(id);
    if (!row) throw new Error(`Falta el tema ${id}`);
    const meta = THEME_META[id];
    row.kind = 'theme';
    row.title = meta.title;
    row.glyph = meta.glyph;
    delete row.parentId;
    if (DEFERRED_THEME_IDS.includes(id)) row.listed = false;
    else delete row.listed;
  }

  for (const [id, parentId] of Object.entries(EXISTING_SUBTOPIC_PARENT)) {
    const row = byId.get(id);
    if (!row) throw new Error(`Falta el subtema ${id}`);
    row.kind = 'subtopic';
    row.parentId = parentId;
    delete row.listed;
  }

  for (const sub of subtopicsFromMap()) {
    const existing = byId.get(sub.id);
    const parentChars = byId.get(sub.parentId)?.characters ?? [];
    const characters = ensureChars(sub.id, existing?.characters ?? [sub.glyph, ...parentChars]);
    byId.set(sub.id, {
      id: sub.id,
      title: existing && EXISTING_SUBTOPIC_PARENT[sub.id] ? existing.title : sub.title,
      glyph: existing?.glyph || sub.glyph,
      kind: 'subtopic',
      parentId: sub.parentId,
      characters,
    });
  }

  // Stable order: visible themes + their subtopics, tags, deferred themes.
  const ordered = [];
  const take = (id) => {
    const row = byId.get(id);
    if (!row || ordered.some((t) => t.id === id)) return;
    ordered.push(row);
  };
  for (const themeId of VISIBLE_THEME_IDS) {
    take(themeId);
    for (const row of byId.values()) {
      if (row.kind === 'subtopic' && row.parentId === themeId) take(row.id);
    }
  }
  for (const id of TAG_IDS) take(id);
  for (const id of DEFERRED_THEME_IDS) take(id);
  for (const row of byId.values()) take(row.id);
  return ordered;
}

export function matchCatalog(entries, vocabulary) {
  const bySimplified = new Map();
  for (const word of vocabulary) {
    const list = bySimplified.get(word.simplified) ?? [];
    list.push(word);
    bySimplified.set(word.simplified, list);
  }
  const hits = [];
  const misses = [];
  for (const entry of entries) {
    const candidates = bySimplified.get(entry.simplified) ?? [];
    const matched = candidates.filter((word) => reading(word.pinyin) === reading(entry.pinyin));
    if (matched.length === 1) hits.push({ entry, word: matched[0] });
    else if (candidates.length === 1) hits.push({ entry, word: candidates[0], loose: true });
    else misses.push({ simplified: entry.simplified, pinyin: entry.pinyin, candidates: candidates.length });
  }
  return { hits, misses };
}

export function applyAssignments(vocabulary, assignments) {
  // assignments: Map<wordId, Set<subtopicId | themeId | tagId>>
  let added = 0;
  const next = vocabulary.map((word) => {
    const extra = assignments.get(word.id);
    if (!extra?.size) return word;
    const topicIds = [...word.topicIds];
    for (const id of extra) {
      if (!topicIds.includes(id)) {
        topicIds.push(id);
        added += 1;
      }
    }
    return { ...word, topicIds };
  });
  return { vocabulary: next, added };
}

export async function fetchListEntries(client, slug) {
  const entries = [];
  let url = `${ORIGIN}/es/dictionary/list/${slug}`;
  let pages = 0;
  while (url) {
    const cached = await client(url);
    const parsed = parseList(cached.html, url);
    entries.push(...parsed.entries);
    url = parsed.next;
    pages += 1;
  }
  return { slug, entries, pages };
}

const help = `Uso: node scripts/categorize-tongtong-topics.mjs [opciones]

  --themes comida,personas,...  Temas a rellenar (por defecto los cinco primeros)
  --warm-cache                  Solo descarga las listas a la caché
  --structure-only              Solo kinds/padres/subtemas nuevos, sin TongTong
  --offline                     Solo usa la caché
  --refresh                     Vuelve a descargar
  --apply                       Escribe vocabulary, topics.ts y snapshot
  --out .cache/tongtong/topics  Informe y borrador
  --help
`;

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      themes: { type: 'string', default: VISIBLE_THEME_IDS.join(',') },
      'warm-cache': { type: 'boolean' },
      'structure-only': { type: 'boolean' },
      offline: { type: 'boolean' },
      refresh: { type: 'boolean' },
      apply: { type: 'boolean' },
      out: { type: 'string', default: '.cache/tongtong/topics' },
      'cache-dir': { type: 'string', default: '.cache/tongtong' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (values.offline && values.refresh) throw new Error('--offline y --refresh son incompatibles.');

  const themeIds = values.themes.split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of themeIds) {
    if (!VISIBLE_THEME_IDS.includes(id) && !DEFERRED_THEME_IDS.includes(id)) {
      throw new Error(`Tema desconocido: ${id}`);
    }
  }
  const slugs = listSlugsForThemes(themeIds);
  const out = resolve(ROOT, values.out);
  await mkdir(out, { recursive: true });

  const snapshot = await readJson(join(ROOT, 'content/snapshot.json'));
  const knownChars = new Set(snapshot.characters.map((c) => c.character));

  if (values['structure-only']) {
    const topics = rebuildTopics(snapshot.topics, knownChars);
    await writeFile(join(out, 'structure-topics.json'), json(topics));
    if (values.apply) {
      await writeTopicsFile(topics);
      await writeFile(join(ROOT, 'content/snapshot.json'), json({ ...snapshot, topics }));
      console.log(`Estructura aplicada: ${topics.length} temas.`);
    } else {
      console.log(`Estructura lista (${topics.length} temas) en ${out}. Pasa --apply para escribir.`);
    }
    return;
  }

  const client = createClient({
    cacheDir: resolve(ROOT, values['cache-dir']),
    offline: values.offline,
    refresh: values.refresh,
  });

  const report = {
    source: ORIGIN,
    generated: new Date().toISOString(),
    themeIds,
    slugs,
    lists: [],
    matched: 0,
    looseMatches: 0,
    missed: 0,
    topicAdds: 0,
    bySubtopic: {},
  };

  const assignments = new Map();
  const charsBySubtopic = new Map();
  const addChar = (subtopicId, char) => {
    const set = charsBySubtopic.get(subtopicId) ?? new Set();
    set.add(char);
    charsBySubtopic.set(subtopicId, set);
  };

  for (const slug of slugs) {
    const meta = TONG_LIST_MAP[slug];
    if (!meta) continue;
    console.log(`Lista ${slug} → ${meta.themeId}/${meta.subtopicId}`);
    const { entries, pages } = await fetchListEntries(client, slug);
    if (values['warm-cache']) {
      report.lists.push({ slug, pages, entries: entries.length });
      continue;
    }
    const { hits, misses } = matchCatalog(entries, snapshot.vocabulary);
    report.lists.push({
      slug,
      themeId: meta.themeId,
      subtopicId: meta.subtopicId,
      pages,
      entries: entries.length,
      matched: hits.length,
      missed: misses.length,
    });
    report.matched += hits.length;
    report.missed += misses.length;
    report.bySubtopic[meta.subtopicId] = (report.bySubtopic[meta.subtopicId] ?? 0) + hits.length;
    for (const hit of hits) {
      if (hit.loose) report.looseMatches += 1;
      const ids = assignments.get(hit.word.id) ?? new Set();
      ids.add(meta.subtopicId);
      ids.add(meta.themeId);
      assignments.set(hit.word.id, ids);
      for (const char of hit.word.characters) {
        if (knownChars.has(char)) addChar(meta.subtopicId, char);
      }
    }
  }

  if (values['warm-cache']) {
    await writeFile(join(out, 'warm-report.json'), json(report));
    console.log(`Caché lista: ${report.lists.length} listas. Informe en ${out}`);
    return;
  }

  const charsMap = new Map([...charsBySubtopic].map(([id, set]) => [id, [...set]]));
  const topics = rebuildTopics(snapshot.topics, knownChars, charsMap);
  const { vocabulary, added } = applyAssignments(snapshot.vocabulary, assignments);
  report.topicAdds = added;

  const draft = {
    schemaVersion: 1,
    baseRevision: snapshotRevision(snapshot),
    snapshot: { ...snapshot, topics, vocabulary },
  };
  await writeFile(join(out, 'report.json'), json(report));
  await writeFile(join(out, 'draft-snapshot.json'), json(draft.snapshot));
  await writeFile(join(out, 'draft.json'), json(draft));

  console.log(`${report.matched} cruces (${report.looseMatches} sin tonos exactos), ${report.missed} fuera del catálogo, +${added} etiquetas.`);

  if (!values.apply) {
    console.log(`Borrador del editor: ${join(out, 'draft.json')}`);
    return;
  }

  // Write per-level vocabulary files the app imports.
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const rows = vocabulary.filter((w) => w.level === level);
    await writeFile(join(ROOT, `src/data/vocabulary/hsk${level}.json`), json(rows));
  }
  const extras = vocabulary.filter((w) => w.level === undefined);
  if (extras.length) await writeFile(join(ROOT, 'src/data/vocabulary/extra.json'), json(extras));

  await writeTopicsFile(topics);
  await writeFile(join(ROOT, 'content/snapshot.json'), json({ ...snapshot, topics, vocabulary }));
  console.log('Aplicado a vocabulary, topics.ts y content/snapshot.json.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
