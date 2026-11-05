import { fireEvent, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProgressBackup, { applyCombinedBackup, exportCombinedBackup } from '../src/components/ProgressBackup';
import { progressStore } from '../src/stores/progressStore';
import { createLearningSession } from '../src/stores/learningSessionStore';
import type { LearningStore } from '../src/stores/learningStore';
import { renderWithStore, testLearningStore } from './fixtures/learningStore';

const legacy = (right: number) => JSON.stringify({
  version: 4,
  chars: { 好: { right, wrong: 0, reps: right, lapses: 0, interval: 1, ease: 2.5, due: 1, strokeRuns: 0, strokeBest: null, lastSeen: 1, updatedAt: 1, deviceId: 'other' } },
  daily: { day: '2026-10-31', reviewed: right, introduced: 0, streak: 1 },
  words: { 'old-word': { right: 3 } },
  wordDaily: { day: '2026-10-31', reviewed: 0, introduced: 0, streak: 0 },
});

/** Teaches the first word of Hoy on `store`: one exposure in its log. */
const teachOne = async (store: LearningStore) => {
  const session = createLearningSession({ mode: 'today', store, seed: 1 });
  await session.ready;
  session.actions.continue();
  await session.idle();
};

const choose = (text: string) => {
  const file = new File(['backup'], 'progress.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(text) });
  fireEvent.change(screen.getByLabelText('Importar copia'), { target: { files: [file] } });
};

const stores: LearningStore[] = [];
const store = () => {
  const created = testLearningStore();
  stores.push(created);
  return created;
};

describe('the combined backup', () => {
  beforeEach(() => { progressStore.clear(); });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const created of stores.splice(0)) created.close();
  });

  it('exports the learning log and the character records in one file', async () => {
    const words = store();
    await words.init();
    await teachOne(words);
    progressStore.grade('人', 'good');
    const file = JSON.parse(await exportCombinedBackup(words));
    expect(Object.keys(file).sort()).toEqual(['learning', 'legacyCharacters']);
    expect(file.learning.events).toHaveLength(1);
    expect(file.learning.events[0].type).toBe('exposure');
    expect(file.legacyCharacters.chars['人'].right).toBe(1);
    expect(file.legacyCharacters).not.toHaveProperty('words');
  });

  it('merges another device: new events join the log and the later copy of each character stays', async () => {
    const other = store();
    await other.init();
    await teachOne(other);
    const theirs = JSON.parse(await exportCombinedBackup(other));
    theirs.legacyCharacters.chars = JSON.parse(legacy(4)).chars;
    progressStore.clear();
    progressStore.grade('人', 'good');

    const mine = store();
    renderWithStore(() => <ProgressBackup />, mine);
    await mine.init();
    choose(JSON.stringify(theirs));
    expect(await screen.findByText(/La copia tiene 1 registro de aprendizaje y 1 carácter\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Combinar con mi progreso' }));
    expect(await screen.findByText('Copia combinada con tu progreso. 2 registros nuevos.')).toBeTruthy();
    expect(mine.events()).toHaveLength(1);
    expect(progressStore.get('人')?.right).toBe(1);
    expect(progressStore.get('好')?.right).toBe(4);
  });

  it('replaces only after a second confirmation, and a v4 file leaves the word log alone', async () => {
    const mine = store();
    await mine.init();
    await teachOne(mine);
    progressStore.grade('人', 'good');
    renderWithStore(() => <ProgressBackup />, mine);
    choose(legacy(4));
    // A v4 file brings characters; its old word records are not imported.
    expect(await screen.findByText(/La copia tiene 1 carácter\./)).toBeTruthy();
    expect(screen.getByText(/progreso antiguo de 1 palabra, que no se importa/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar progreso' }));
    expect(progressStore.get('好')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar' }));
    await waitFor(() => expect(progressStore.get('好')?.right).toBe(4));
    expect(progressStore.get('人')).toBeUndefined();
    expect(mine.events()).toHaveLength(1);
    expect(screen.getByText('Copia restaurada.')).toBeTruthy();
  });

  it('replaces the word log with the one in the file', async () => {
    const empty = store();
    await empty.init();
    const blank = await exportCombinedBackup(empty);
    const mine = store();
    await mine.init();
    await teachOne(mine);
    const result = await applyCombinedBackup(mine, blank, true);
    expect(result).toMatchObject({ ok: true });
    expect(mine.events()).toHaveLength(0);
    expect(mine.status(mine.runtime().pool()[0].itemId)).toBe('new');
  });

  it('keeps everything when the file is not valid', async () => {
    progressStore.grade('人', 'good');
    const mine = store();
    renderWithStore(() => <ProgressBackup />, mine);
    choose('{');
    expect(await screen.findByText('Esta copia no es válida. Tu progreso no ha cambiado.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Combinar con mi progreso' })).toBeNull();
    expect(progressStore.get('人')?.right).toBe(1);
  });

  it('ignores an older file read when the user selects another file', async () => {
    renderWithStore(() => <ProgressBackup />, store());
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const first = new File(['first'], 'first.json');
    const second = new File(['second'], 'second.json');
    Object.defineProperty(first, 'text', { value: () => new Promise<string>((resolve) => { resolveFirst = resolve; }) });
    Object.defineProperty(second, 'text', { value: () => new Promise<string>((resolve) => { resolveSecond = resolve; }) });
    const input = screen.getByLabelText('Importar copia');
    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.change(input, { target: { files: [second] } });
    resolveSecond(legacy(2));
    await screen.findByText(/La copia tiene 1 carácter\./);
    resolveFirst('{');
    await Promise.resolve();
    expect(screen.queryByText(/Esta copia no es válida/)).toBeNull();
  });

  it('keeps the words and says so when the characters cannot be saved', async () => {
    const other = store();
    await other.init();
    await teachOne(other);
    const theirs = await exportCombinedBackup(other);
    const mine = store();
    await mine.init();
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const result = await applyCombinedBackup(mine, theirs, false);
    write.mockRestore();
    expect(result).toMatchObject({ ok: true, added: 1 });
    expect(result.ok && result.warnings[0]).toMatch(/No se pudo guardar el progreso de los caracteres/);
    expect(mine.events()).toHaveLength(1);
  });
});

describe('the storage notice', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('offers confirmed recovery after storage reads start working again', async () => {
    localStorage.setItem('hsk-flashcards-stats', legacy(2));
    vi.resetModules();
    const getItem = vi.spyOn(localStorage, 'getItem');
    getItem.mockImplementationOnce(() => { throw new Error('temporary read failure'); });
    const { progressStore: chars } = await import('../src/stores/progressStore');
    const { ProgressStorageNotice } = await import('../src/components/ProgressBackup');
    const testing = await import('@solidjs/testing-library');

    chars.grade('人', 'good');
    testing.render(() => <ProgressStorageNotice />);
    testing.fireEvent.click(testing.screen.getByRole('button', { name: 'Recuperar progreso guardado' }));
    expect(testing.screen.getByText(/reemplazará el progreso actual/)).toBeTruthy();
    testing.fireEvent.click(testing.screen.getByRole('button', { name: 'Usar progreso guardado' }));

    expect(chars.get('好')?.right).toBe(2);
    expect(chars.get('人')).toBeUndefined();
    await testing.waitFor(() => expect(testing.screen.queryByRole('alert')).toBeNull());
  });
});
