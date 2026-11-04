// Content publication for the editor. Three actions:
//   generate            copy content/snapshot.json into editor/public/base/ with its revision hash
//   import <draft>      write the files a draft changes into editor/export/ for manual review
//   promote <draft>     write those files into the repo, bump content/version.json, rebuild the search index
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
  const rows = topics.map((topic) => `  {\n    id: ${quote(topic.id)},\n    title: ${quote(topic.title)},\n    glyph: ${quote(topic.glyph)},\n    characters: ${characters(topic.characters)},\n  },`).join('\n');
  return [path, source.replace(pattern, `export const topics: Topic[] = [\n${rows}\n];`)];
};

/**
 * The repo files a draft changes, as [path, body] pairs, without writing anything.
 * Validates the draft against the canonical snapshot first.
 */
export async function planDraft(draft, root = defaultRoot) {
  const { validateSnapshot, validateDraft } = await model(root);
  const base = await readJson(join(root, 'content/snapshot.json'));
  validateSnapshot(base);
  validateDraft(draft, base, snapshotRevision(base));
  const snapshot = draft.snapshot;
  const files = [];
  if (!equal(snapshot, base)) files.push(['content/snapshot.json', json(snapshot)]);
  if (!equal(snapshot.topics, base.topics)) files.push(await topicsSource(root, snapshot.topics));
  for (let n = 1; n <= 6; n++) {
    const words = snapshot.vocabulary.filter((row) => row.level === n);
    if (!equal(words, base.vocabulary.filter((row) => row.level === n))) files.push([`src/data/vocabulary/hsk${n}.json`, json(words)]);
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
  const extra = snapshot.vocabulary.filter((row) => row.level === undefined);
  if (!equal(extra, base.vocabulary.filter((row) => row.level === undefined))) files.push(['src/data/vocabulary/extra.json', json(extra)]);
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
