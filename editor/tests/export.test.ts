import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, copyFileSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = existsSync(join(process.cwd(), 'scripts/content-publish.mjs')) ? process.cwd() : resolve(process.cwd(), '..');
const dirs: string[] = [];
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const base = {
  schemaVersion: 1,
  vocabulary: [{ id: 'word-1', simplified: '一', traditional: '一', pinyin: 'yī', senses: [{ text: 'uno' }], level: 1, characters: ['一'], topicIds: ['numbers'], sourceId: 'hsk-2-0' }],
  characters: ['一', '二', '三', '四', '五'].map((character, index) => ({ character, traditional: character, pinyin: 'yī', definition: index === 0 ? 'uno' : 'número', radical: '一', stroke_count: index + 1, hsk_level: 1, general_standard: index + 1, frequency_rank: index + 1 })),
  topics: [{ id: 'numbers', title: 'Números', glyph: '一', kind: 'tag', characters: ['一', '二', '三', '四', '五'] }],
};
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'jiayou-export-'));
  dirs.push(dir);
  for (const sub of ['scripts', 'editor/lib', 'content', 'src/data/vocabulary', 'public/packs']) mkdirSync(join(dir, sub), { recursive: true });
  copyFileSync(join(root, 'scripts/content-publish.mjs'), join(dir, 'scripts/content-publish.mjs'));
  copyFileSync(join(root, 'scripts/build-search-index.mjs'), join(dir, 'scripts/build-search-index.mjs'));
  writeFileSync(join(dir, 'content/version.json'), json({ version: 1, date: '2026-11-03', notes: 'Primera versión.' }));
  copyFileSync(join(root, 'editor/lib/model.ts'), join(dir, 'editor/lib/model.ts'));
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  writeFileSync(join(dir, 'content/snapshot.json'), json(base));
  writeFileSync(join(dir, 'src/data/topics.ts'), 'export const topics: Topic[] = [\n];\n');
  return dir;
};
const setupReal = () => {
  const dir = setup();
  cpSync(join(root, 'src/data'), join(dir, 'src/data'), { recursive: true });
  for (let level = 2; level <= 6; level++) copyFileSync(join(root, `public/packs/hsk${level}.json`), join(dir, `public/packs/hsk${level}.json`));
  copyFileSync(join(root, 'content/snapshot.json'), join(dir, 'content/snapshot.json'));
  copyFileSync(join(root, 'src/data/topics.ts'), join(dir, 'src/data/topics.ts'));
  return dir;
};
const run = (dir: string, ...args: string[]) => {
  try {
    return execFileSync(process.execPath, [join(dir, 'scripts/content-publish.mjs'), ...args], { cwd: dir, stdio: 'pipe' });
  } catch {
    throw new Error('El generador rechazó el borrador.');
  }
};
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('standalone content export', () => {
  it('exports authored word examples but excludes imported reference phrases', () => {
    const dir = setup();
    const snapshot = { ...structuredClone(base), vocabulary: [{ ...base.vocabulary[0], example: { chinese: '我有一个。', spanish: 'Tengo uno.' } }] };
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, json({ schemaVersion: 1, baseRevision: hash(json(base)), snapshot,
      references: { 'word-1': { url: 'https://example.com/dictionary/一-yi', retrieved: '2026-11-04', examples: [{ chinese: '一二三。', pinyin: 'Yī èr sān.', spanish: 'Uno, dos, tres.' }] } },
    }));
    run(dir, 'import', draftPath);
    const rows = JSON.parse(readFileSync(join(dir, 'editor/export/src/data/vocabulary/hsk1.json'), 'utf8'));
    expect(rows[0].example).toEqual(snapshot.vocabulary[0].example);
    const canonical = readFileSync(join(dir, 'editor/export/content/snapshot.json'), 'utf8');
    expect(canonical).not.toContain('references');
    expect(canonical).not.toContain('Uno, dos, tres.');
  });
  it('does not export app data for an unchanged real snapshot', () => {
    const dir = setupReal();
    const body = readFileSync(join(dir, 'content/snapshot.json'), 'utf8');
    const snapshot = JSON.parse(body);
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, json({ schemaVersion: 1, baseRevision: hash(json(snapshot)), snapshot }));
    run(dir, 'import', draftPath);
    const exported = join(dir, 'editor/export');
    expect(existsSync(exported) ? readdirSync(exported).filter((name) => name !== '.generated-files.json') : []).toEqual([]);
    expect(readFileSync(join(dir, 'content/snapshot.json'), 'utf8')).toBe(body);
  });
  it('exports a revised HSK1 example without changing other character data', () => {
    const dir = setupReal();
    const baseSnapshot = JSON.parse(readFileSync(join(dir, 'content/snapshot.json'), 'utf8'));
    const snapshot = structuredClone(baseSnapshot);
    const entry = snapshot.characters.find((item: { character: string }) => item.character === '的');
    expect(entry.gloss).toBe('partícula posesiva');
    expect(entry.example).toEqual({ word: '我的', pinyin: 'wǒ de', es: 'mío, mi' });
    entry.example.es = 'mi';
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, json({ schemaVersion: 1, baseRevision: hash(json(baseSnapshot)), snapshot }));
    run(dir, 'import', draftPath);
    const rows = JSON.parse(readFileSync(join(dir, 'editor/export/src/data/hsk1.json'), 'utf8'));
    const updated = rows.find((item: { character: string }) => item.character === '的');
    const originalRows = JSON.parse(readFileSync(join(dir, 'src/data/hsk1.json'), 'utf8'));
    const original = originalRows.find((item: { character: string }) => item.character === '的');
    expect(rows.filter((item: { character: string }) => item.character !== '的')).toEqual(originalRows.filter((item: { character: string }) => item.character !== '的'));
    expect(updated).toEqual({ ...original, example: entry.example });
    const sidecar = JSON.parse(readFileSync(join(dir, 'editor/export/src/data/glosses/hsk1.json'), 'utf8'));
    expect(sidecar['的']).toEqual({ gloss: entry.gloss, example: entry.example });
    expect(updated.pinyin).toBe(original.pinyin);
  });
  it('rejects stale drafts without changing the base snapshot', () => {
    const dir = setup();
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, json({ schemaVersion: 1, baseRevision: 'stale', snapshot: base }));
    expect(() => run(dir, 'import', draftPath)).toThrow();
    expect(readFileSync(join(dir, 'content/snapshot.json'), 'utf8')).toBe(json(base));
  });
  it('exports edits, topic order and extra words without altering the base', () => {
    const dir = setup();
    const snapshot = structuredClone(base);
    snapshot.vocabulary[0].senses = [{ text: 'primero' }];
    snapshot.characters[0].definition = 'primer número';
    snapshot.topics.unshift({ id: 'newtopic', title: 'Nuevo', glyph: '一', kind: 'theme', characters: ['一', '二', '三', '四', '五'] });
    snapshot.vocabulary.push({ ...snapshot.vocabulary[0], id: 'extra-1', level: undefined as unknown as number, topicIds: ['newtopic'] });
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, json({ schemaVersion: 1, baseRevision: hash(json(base)), snapshot }));
    run(dir, 'import', draftPath);
    const out = (path: string) => join(dir, 'editor/export', path);
    expect(JSON.parse(readFileSync(out('src/data/vocabulary/hsk1.json'), 'utf8'))[0]).toMatchObject({ id: 'word-1', senses: [{ text: 'primero' }] });
    expect(JSON.parse(readFileSync(out('src/data/vocabulary/extra.json'), 'utf8'))[0]).toMatchObject({ id: 'extra-1', topicIds: ['newtopic'] });
    expect(JSON.parse(readFileSync(out('src/data/hsk1.json'), 'utf8'))[0]).toMatchObject({ character: '一', definition: 'primer número' });
    expect(readFileSync(out('src/data/topics.ts'), 'utf8')).toContain('Nuevo');
    expect(JSON.parse(readFileSync(out('content/snapshot.json'), 'utf8')).topics.map((topic: { id: string }) => topic.id)).toEqual(['newtopic', 'numbers']);
    expect(readFileSync(join(dir, 'content/snapshot.json'), 'utf8')).toBe(json(base));
  });
  it('rejects a changed identifier before writing files', () => {
    const dir = setup();
    const snapshot = structuredClone(base);
    snapshot.vocabulary[0].id = 'other';
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, json({ schemaVersion: 1, baseRevision: hash(json(base)), snapshot }));
    expect(() => run(dir, 'import', draftPath)).toThrow();
    expect(readFileSync(join(dir, 'content/snapshot.json'), 'utf8')).toBe(json(base));
  });
  it('promotes a draft into the repo, bumps the content version and rebuilds the search index', () => {
    const dir = setupReal();
    const baseSnapshot = JSON.parse(readFileSync(join(dir, 'content/snapshot.json'), 'utf8'));
    const snapshot = structuredClone(baseSnapshot);
    const entry = snapshot.characters.find((item: { character: string }) => item.character === '的');
    entry.gloss = 'partícula de posesión';
    const topic = snapshot.topics.find((item: { id: string }) => item.id === 'familia');
    topic.title = 'Familia y amigos';
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, json({ schemaVersion: 1, baseRevision: hash(json(baseSnapshot)), snapshot }));
    const output = run(dir, 'promote', draftPath, '--notes', 'Glosa de 的 y título de familia.').toString();
    expect(output).toContain('Contenido v2');
    const version = JSON.parse(readFileSync(join(dir, 'content/version.json'), 'utf8'));
    expect(version).toMatchObject({ version: 2, notes: 'Glosa de 的 y título de familia.' });
    expect(version.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.parse(readFileSync(join(dir, 'content/snapshot.json'), 'utf8'))).toEqual(snapshot);
    const rows = JSON.parse(readFileSync(join(dir, 'src/data/hsk1.json'), 'utf8'));
    expect(rows.find((item: { character: string }) => item.character === '的').gloss).toBe('partícula de posesión');
    const index = JSON.parse(readFileSync(join(dir, 'src/data/searchIndex.json'), 'utf8'));
    expect(index.find((item: { character: string }) => item.character === '的').gloss).toBe('partícula de posesión');
    expect(readFileSync(join(dir, 'src/data/topics.ts'), 'utf8')).toContain("title: 'Familia y amigos'");
    const base = readFileSync(join(dir, 'editor/public/base/snapshot.json'));
    expect(JSON.parse(base.toString())).toEqual(snapshot);
    expect(JSON.parse(readFileSync(join(dir, 'editor/public/base/revision.json'), 'utf8')).revision).toBe(hash(base.toString()));
    expect(JSON.parse(readFileSync(join(dir, 'editor/public/base/version.json'), 'utf8')).version).toBe(2);
  });
  it('refuses to promote a draft with no changes', () => {
    const dir = setup();
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, json({ schemaVersion: 1, baseRevision: hash(json(base)), snapshot: base }));
    expect(() => run(dir, 'promote', draftPath)).toThrow();
    expect(JSON.parse(readFileSync(join(dir, 'content/version.json'), 'utf8')).version).toBe(1);
  });
});
