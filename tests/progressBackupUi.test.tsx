import { fireEvent, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProgressBackup, { applyUserBackup, exportUserBackup } from '../src/components/ProgressBackup';
import { characterStore } from '../src/stores/characterStore';
import { createLearningSession } from '../src/stores/learningSessionStore';
import { characterItemId, type LearningStore } from '../src/stores/learningStore';
import type { SessionMode } from '../src/domain/learning/types';
import { renderWithStore, testLearningStore } from './fixtures/learningStore';

vi.mock('../src/components/StrokeCanvas', () => ({ default: () => null }));

/** A v4 progress file, as the old character store wrote it. */
const legacy = JSON.stringify({
  version: 4,
  chars: { 好: { right: 4, wrong: 0, reps: 4, lapses: 0, interval: 1, ease: 2.5, due: 1, strokeRuns: 0, strokeBest: null, lastSeen: 1, updatedAt: 1, deviceId: 'other' } },
  daily: { day: '2026-10-31', reviewed: 4, introduced: 0, streak: 1 },
  words: { 'old-word': { right: 3 } },
  wordDaily: { day: '2026-10-31', reviewed: 0, introduced: 0, streak: 0 },
});

/** Teaches the first card of a session on `store`: one exposure in its log. */
const teachOne = async (store: LearningStore, mode: SessionMode) => {
  const session = createLearningSession({ mode, store, seed: 1, resume: false });
  await session.ready;
  session.actions.continue();
  await session.idle();
};

/** One word and one character taught: two exposures. */
const teachBoth = async (store: LearningStore) => {
  await store.init();
  await teachOne(store, 'today');
  await teachOne(store, 'strokes');
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

describe('the backup', () => {
  beforeEach(() => characterStore.selectLevels([1]));
  afterEach(() => {
    vi.restoreAllMocks();
    for (const created of stores.splice(0)) created.close();
    characterStore.reset();
    localStorage.clear();
  });

  it('exports the learning log alone, words and characters together', async () => {
    const mine = store();
    await teachBoth(mine);
    const file = JSON.parse(await exportUserBackup(mine));
    expect(Object.keys(file).sort()).toEqual(['configs', 'deviceId', 'events', 'exportedAt', 'schemaVersion']);
    expect(file.events.map((event: { itemId: string }) => event.itemId.split(':')[0]).sort()).toEqual(['character-writing', 'word-meaning']);
  });

  it('round trips through another device: the merge adds the word and the character', async () => {
    const other = store();
    await teachBoth(other);
    const theirs = await exportUserBackup(other);
    const char = other.events().find((event) => event.itemId.startsWith('character-writing:'))!.itemId;

    const mine = store();
    renderWithStore(() => <ProgressBackup />, mine);
    await mine.init();
    choose(theirs);
    expect(await screen.findByText(/La copia tiene 2 registros de aprendizaje\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Combinar con mi progreso' }));
    expect(await screen.findByText('Copia combinada con tu progreso. 2 registros nuevos.')).toBeTruthy();
    expect(mine.events()).toHaveLength(2);
    expect(mine.status(char)).toBe('learning');
    expect(char).toMatch(/^character-writing:char-[0-9a-f]+$/);
  });

  it('replaces the log with the one in the file', async () => {
    const empty = store();
    await empty.init();
    const blank = await exportUserBackup(empty);
    const mine = store();
    await teachBoth(mine);
    const result = await applyUserBackup(mine, blank, true);
    expect(result).toMatchObject({ ok: true });
    expect(mine.events()).toHaveLength(0);
    expect(mine.status(characterItemId('爱'))).toBe('new');
  });

  it('reads a v4 file, imports nothing from it and says so', async () => {
    const mine = store();
    await mine.init();
    await teachOne(mine, 'today');
    renderWithStore(() => <ProgressBackup />, mine);
    choose(legacy);
    expect(await screen.findByText(/progreso antiguo de 1 carácter y 1 palabra, que no se importa/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Combinar con mi progreso' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copia combinada. No traía nada que no tuvieras ya.'));
    expect(mine.events()).toHaveLength(1);
  });

  it('imports the learning half of an older combined file and ignores its characters', async () => {
    const other = store();
    await teachBoth(other);
    const file = JSON.stringify({ learning: JSON.parse(await exportUserBackup(other)), legacyCharacters: JSON.parse(legacy) });
    const mine = store();
    await mine.init();
    const result = await applyUserBackup(mine, file, false);
    expect(result).toMatchObject({ ok: true, added: 2 });
    expect(result.ok && result.warnings[0]).toMatch(/progreso antiguo de 1 carácter, que no se importa/);
  });

  it('keeps everything when the file is not valid', async () => {
    const mine = store();
    await mine.init();
    await teachOne(mine, 'today');
    renderWithStore(() => <ProgressBackup />, mine);
    choose('{');
    expect(await screen.findByText('Esta copia no es válida. Tu progreso no ha cambiado.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Combinar con mi progreso' })).toBeNull();
    expect(mine.events()).toHaveLength(1);
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
    resolveSecond(legacy);
    await screen.findByText(/La copia tiene 1 carácter\./);
    resolveFirst('{');
    await Promise.resolve();
    expect(screen.queryByText(/Esta copia no es válida/)).toBeNull();
  });
});
