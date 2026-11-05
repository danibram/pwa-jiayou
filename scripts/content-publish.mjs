// Content publication for the editor. Three actions:
//   generate            copy content/snapshot.json into editor/public/base/ with its revision hash
//   import <draft>      write the files a draft changes into editor/export/ for manual review
//   promote <draft>     write those files into the repo, bump content/version.json, rebuild the search index
// Every draft that changes content also updates the published id registry (REGISTRY_PATH), which keeps
// each word and character id forever, its status and every revision the client has computed for it.
// The editor dev server imports promoteDraft/planDraft; the CLI below only runs when the file is executed.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (value, indent = 2) => `${JSON.stringify(value, null, indent)}\n`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const readOptional = async (path, fallback) => {
  try { return await readJson(path); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};

let validators;
const model = async (root) => {
  if (validators) return validators;
  const source = await readFile(join(root, 'editor/lib/model.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  validators = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  return validators;
};

const revisionModules = new Map();
/**
 * The client's own src/domain/learning/content/revision.ts, bundled with esbuild so plain node can run
 * it: a published revision is the value the app computes, not a copy of the rule.
 */
export async function loadRevisions(root = defaultRoot) {
  if (revisionModules.has(root)) return revisionModules.get(root);
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [join(root, 'src/domain/learning/content/revision.ts')],
    bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const loaded = import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  revisionModules.set(root, loaded);
  return loaded;
}

export const REGISTRY_PATH = 'src/data/vocabulary/published-ids.json';
export const REGISTRY_SCHEMA = 2;

/** The list a word row is filed under: hsk1 to hsk6, or extra when it has no level. */
export const listOf = (row) => (row.level === undefined ? 'extra' : `hsk${row.level}`);

const sortedEntries = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * The registry after publishing `words` and `characters`. Pure, so tests can pass revision functions.
 * - An id never leaves the registry. A word row missing from `words` is an error: retire it instead
 *   (row.retired), which keeps the row in the snapshot and its id taken.
 * - A word is "available" or "retired"; `list` says where it ships (hsk2 to hsk6 come with their pack).
 * - `revisions` lists every revision published for the id, oldest first. A changed revision is
 *   appended, so attempts saved against an older one can still be told apart from a missing id.
 * The first registry was a bare array of HSK ids; those ids are read as published words.
 */
export function updateRegistry(previous, { words, characters }, revise) {
  const legacy = Array.isArray(previous);
  const prior = legacy
    ? { words: Object.fromEntries(previous.map((id) => [id, { revisions: [] }])), characters: {} }
    : previous ?? { words: {}, characters: {} };
  const entry = (before, revision, fields) => {
    const revisions = [...(before?.revisions ?? [])];
    if (revisions[revisions.length - 1] !== revision) revisions.push(revision);
    return { ...fields, revisions };
  };
  const nextWords = {};
  for (const row of words) {
    if (nextWords[row.id]) throw new Error(`Id de palabra duplicado: ${row.id}.`);
    nextWords[row.id] = entry(prior.words[row.id], revise.wordRevision(row), { status: row.retired ? 'retired' : 'available', list: listOf(row) });
  }
  const gone = Object.keys(prior.words).filter((id) => !nextWords[id]);
  if (gone.length) throw new Error(`Faltan palabras publicadas: ${gone.join(', ')}. Retíralas en lugar de borrarlas; su id no se puede reutilizar.`);
  const nextCharacters = {};
  for (const row of characters) {
    const id = revise.characterContentId(row.character);
    if (nextCharacters[id]) throw new Error(`Carácter duplicado: ${row.character}.`);
    nextCharacters[id] = entry(prior.characters[id], revise.characterRevision(row), { status: 'available', list: `hsk${row.hsk_level}` });
  }
  const goneChars = Object.keys(prior.characters).filter((id) => !nextCharacters[id]);
  if (goneChars.length) throw new Error(`Faltan caracteres publicados: ${goneChars.join(', ')}.`);
  return { schemaVersion: REGISTRY_SCHEMA, words: sortedEntries(nextWords), characters: sortedEntries(nextCharacters) };
}

/** One id per line, so a promotion's diff shows exactly the entries it touched. */
export const registryJson = (registry) => {
  const block = (record) => {
    const rows = Object.entries(record).map(([id, value]) => `    ${JSON.stringify(id)}: ${JSON.stringify(value)}`);
    return rows.length ? `{\n${rows.join(',\n')}\n  }` : '{}';
  };
  return `{\n  "schemaVersion": ${registry.schemaVersion},\n  "words": ${block(registry.words)},\n  "characters": ${block(registry.characters)}\n}\n`;
};

export const readRegistry = (root = defaultRoot) => readOptional(join(root, REGISTRY_PATH), null);

/** The ids a draft may not hand to a new word: every id the registry has ever published. */
const publishedWordIds = (registry) => (Array.isArray(registry) ? registry : Object.keys(registry?.words ?? {}));

export const snapshotRevision = (snapshot) => hash(json(snapshot));

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Copies the canonical snapshot into the editor's public folder, with the WenKai font when the repo has it. */
export async function writeBase(snapshot, root = defaultRoot) {
  const { validateSnapshot } = await model(root);
  validateSnapshot(snapshot);
  const baseDir = join(root, 'editor/public/base');
  const body = json(snapshot);
  await mkdir(baseDir, { recursive: true });
  await writeFile(join(baseDir, 'snapshot.json'), body);
  await writeFile(join(baseDir, 'revision.json'), json({ revision: hash(body) }));
  const version = await readOptional(join(root, 'content/version.json'), { version: 0, date: '', notes: '' });
  await writeFile(join(baseDir, 'version.json'), json(version));
  const font = join(root, 'public/fonts/wenkai-hsk.woff2');
  if (existsSync(font)) await copyFile(font, join(baseDir, 'wenkai-hsk.woff2'));
}

const quote = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const topicsSource = async (root, topics) => {
  const path = 'src/data/topics.ts';
  const source = await readFile(join(root, path), 'utf8');
  const pattern = /export const topics: Topic\[\] = \[[\s\S]*?\n\];/;
  if (!pattern.test(source)) throw new Error('No se encuentra la lista de temas.');
  // Sixteen characters per line, as the hand-written file does, so a promotion reads as a small diff.
  const characters = (chars) => {
    const quoted = chars.map(quote);
    if (quoted.length <= 16) return `[${quoted.join(', ')}]`;
    const lines = [];
    for (let i = 0; i < quoted.length; i += 16) lines.push(`      ${quoted.slice(i, i + 16).join(', ')},`);
    return `[\n${lines.join('\n')}\n    ]`;
  };
  const rows = topics.map((topic) => {
    const lines = [
      `    id: ${quote(topic.id)}`,
      `    title: ${quote(topic.title)}`,
      `    glyph: ${quote(topic.glyph)}`,
      `    kind: ${quote(topic.kind ?? 'theme')}`,
    ];
    if (topic.parentId) lines.push(`    parentId: ${quote(topic.parentId)}`);
    if (topic.listed === false) lines.push('    listed: false');
    lines.push(`    characters: ${characters(topic.characters)}`);
    return `  {\n${lines.join(',\n')},\n  },`;
  }).join('\n');
  return [path, source.replace(pattern, `export const topics: Topic[] = [\n${rows}\n];`)];
};

/**
 * The repo files a draft changes, as [path, body] pairs, without writing anything.
 * Validates the draft against the canonical snapshot first.
 */
export async function planDraft(draft, root = defaultRoot) {
  const { validateSnapshot, validateDraft } = await model(root);
  const base = await readJson(join(root, 'content/snapshot.json'));
  // validateSnapshot fills a missing topic kind, so hash the file as written first.
  const revision = snapshotRevision(base);
  validateSnapshot(base);
  const registry = await readRegistry(root);
  validateDraft(draft, base, revision, publishedWordIds(registry));
  const snapshot = draft.snapshot;
  const files = [];
  // A retired word stays in the snapshot, so its id stays taken, but leaves the lists the app reads.
  const listed = (rows, level) => rows.filter((row) => row.level === level && !row.retired);
  if (!equal(snapshot, base)) files.push(['content/snapshot.json', json(snapshot)]);
  if (!equal(snapshot.topics, base.topics)) files.push(await topicsSource(root, snapshot.topics));
  for (let n = 1; n <= 6; n++) {
    const words = listed(snapshot.vocabulary, n);
    if (!equal(words, listed(base.vocabulary, n))) files.push([`src/data/vocabulary/hsk${n}.json`, json(words)]);
    const characters = snapshot.characters.filter((row) => row.hsk_level === n);
    const old = base.characters.filter((row) => row.hsk_level === n);
    if (equal(characters, old)) continue;
    const charPath = n === 1 ? 'src/data/hsk1.json' : `public/packs/hsk${n}.json`;
    const stored = await readOptional(join(root, charPath), null);
    const storedByChar = new Map((Array.isArray(stored) ? stored : old).map((row) => [row.character, row]));
    const previous = new Map(old.map((row) => [row.character, row]));
    // Only the edited fields change in the stored row, so fields the snapshot leaves out survive.
    const outputRows = characters.map((row) => {
      const prior = previous.get(row.character);
      const original = storedByChar.get(row.character);
      if (!prior || !original) return row;
      const result = { ...original };
      for (const key of new Set([...Object.keys(prior), ...Object.keys(row)])) {
        if (equal(row[key], prior[key])) continue;
        if (row[key] === undefined) delete result[key];
        else result[key] = row[key];
      }
      return result;
    });
    const body = json(outputRows, 4);
    files.push([charPath, body]);
    if (n >= 4) files.push([`src/data/hsk${n}.json`, body]);
    if (![1, 4, 5, 6].includes(n)) continue;
    const sidePath = `src/data/glosses/hsk${n}.json`;
    const curatedPath = `src/data/glosses/curated/hsk${n}.json`;
    const side = await readOptional(join(root, sidePath), {});
    const curated = n >= 4 ? await readOptional(join(root, curatedPath), {}) : null;
    let changedSide = false;
    for (const row of characters) {
      const prior = previous.get(row.character);
      if (prior && equal([row.gloss, row.example, row.definition], [prior.gloss, prior.example, prior.definition])) continue;
      if (!(row.gloss && row.example?.word && row.example?.pinyin && row.example?.es)) continue;
      side[row.character] = { gloss: row.gloss, example: row.example };
      if (curated) curated[row.character] = { gloss: row.gloss, definition: row.definition, example: row.example };
      changedSide = true;
    }
    if (changedSide) {
      files.push([sidePath, json(side)]);
      if (curated) files.push([curatedPath, json(curated)]);
    }
  }
  const extra = listed(snapshot.vocabulary, undefined);
  if (!equal(extra, listed(base.vocabulary, undefined))) files.push(['src/data/vocabulary/extra.json', json(extra)]);
  // The registry follows the content: an unchanged draft writes nothing, not even a registry refresh.
  if (files.length) {
    const nextRegistry = registryJson(updateRegistry(registry, { words: snapshot.vocabulary, characters: snapshot.characters }, await loadRevisions(root)));
    const stored = await readFile(join(root, REGISTRY_PATH), 'utf8').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (nextRegistry !== stored) files.push([REGISTRY_PATH, nextRegistry]);
  }
  const version = await readOptional(join(root, 'content/version.json'), { version: 0, date: '', notes: '' });
  return { files, version };
}

/** Writes the changed files into editor/export/ for manual review. Refuses to clobber files it did not generate. */
export async function exportDraft(draft, root = defaultRoot) {
  const { files } = await planDraft(draft, root);
  const exportDir = join(root, 'editor/export');
  const marker = join(exportDir, '.generated-files.json');
  const previous = await readOptional(marker, []);
  if (!Array.isArray(previous) || previous.some((path) => typeof path !== 'string' || !resolve(exportDir, path).startsWith(`${resolve(exportDir)}${sep}`))) throw new Error('Registro de exportación inválido.');
  for (const [path, body] of files) {
    if (previous.includes(path)) continue;
    const existing = await readFile(join(exportDir, path), 'utf8').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing !== null && existing !== body) throw new Error(`El archivo de exportación ya existe: ${path}`);
  }
  for (const path of previous) await rm(join(exportDir, path), { force: true });
  for (const [path, body] of files) {
    const destination = join(exportDir, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, body);
  }
  if (files.length) {
    await mkdir(exportDir, { recursive: true });
    await writeFile(marker, json(files.map(([path]) => path)));
  } else {
    await rm(marker, { force: true });
  }
  return files.map(([path]) => path);
}

/**
 * Writes the changed files into the repo, bumps content/version.json, rebuilds the search index
 * and refreshes the editor's base. The working tree holds the result; git is the review step.
 */
export async function promoteDraft(draft, { root = defaultRoot, notes = '', date = todayIso() } = {}) {
  const { files, version } = await planDraft(draft, root);
  if (files.length === 0) throw new Error('El borrador no cambia nada respecto a la versión publicada.');
  const next = { version: (Number(version.version) || 0) + 1, date, notes: notes.trim() || `Versión ${(Number(version.version) || 0) + 1} del contenido.` };
  for (const [path, body] of files) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, body);
  }
  await mkdir(join(root, 'content'), { recursive: true });
  await writeFile(join(root, 'content/version.json'), json(next));
  const written = [...files.map(([path]) => path), 'content/version.json'];
  // HSK 2 to 6 words travel inside their level's pack, so a change to them gives that pack a new hash.
  if (files.some(([path]) => path.startsWith('public/packs/') || /^src\/data\/vocabulary\/hsk[2-6]\.json$/.test(path))) {
    const { contentManifest } = await import('./content-manifest.ts');
    await writeFile(join(root, 'public/packs/content.json'), json(contentManifest(root)));
    written.push('public/packs/content.json');
  }
  const touchesCharacters = files.some(([path]) => /hsk\d\.json$/.test(path) && !path.includes('vocabulary'));
  const indexScript = join(root, 'scripts/build-search-index.mjs');
  if (touchesCharacters && existsSync(indexScript)) {
    execFileSync(process.execPath, [indexScript], { cwd: root, stdio: 'pipe' });
    written.push('src/data/searchIndex.json');
  }
  await writeBase(draft.snapshot, root);
  return { version: next, files: written, revision: snapshotRevision(draft.snapshot) };
}

// realpath: macOS runs /var paths through the /private/var symlink, and node resolves the main module to the real path.
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href;
if (isMain) {
  const [action = 'generate', input, ...rest] = process.argv.slice(2);
  if (action === 'generate') {
    await writeBase(await readJson(join(defaultRoot, 'content/snapshot.json')));
  } else if (action === 'import') {
    if (!input) throw new Error('Indica el archivo de borrador.');
    const paths = await exportDraft(await readJson(input));
    console.log(paths.length ? `${paths.length} archivos en ${join(defaultRoot, 'editor/export')}` : 'Sin cambios para exportar.');
  } else if (action === 'promote') {
    if (!input) throw new Error('Indica el archivo de borrador.');
    const notesIndex = rest.indexOf('--notes');
    const notes = notesIndex >= 0 ? rest[notesIndex + 1] ?? '' : '';
    const result = await promoteDraft(await readJson(input), { notes });
    console.log(`Contenido v${result.version.version}: ${result.files.length} archivos escritos.`);
    for (const path of result.files) console.log(`  ${path}`);
  } else {
    throw new Error('Usa generate, import <archivo> o promote <archivo> [--notes "texto"].');
  }
}
