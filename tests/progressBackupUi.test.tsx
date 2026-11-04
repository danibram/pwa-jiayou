import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProgressBackup from '../src/components/ProgressBackup';
import { progressStore } from '../src/stores/progressStore';
import { vocabularyProgressStore } from '../src/stores/vocabularyProgressStore';
import { hasStoredVocabularySession, saveVocabularySession } from '../src/utils/vocabularySession';
import { progressReset } from '../src/utils/progressReset';
import { vocabulary } from './fixtures/levelWords';

const backup = (right: number) => JSON.stringify({
  version: 4,
  chars: { 好: { right, wrong: 0, reps: right, lapses: 0, interval: 1, ease: 2.5, due: 1, strokeRuns: 0, strokeBest: null, lastSeen: 1, updatedAt: 1, deviceId: 'other' } },
  daily: { day: '2026-10-31', reviewed: right, introduced: 0, streak: 1 },
  words: {},
  wordDaily: { day: '2026-10-31', reviewed: 0, introduced: 0, streak: 0 },
});

describe('progress backup UI', () => {
  beforeEach(() => { progressStore.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('validates a selected file and only replaces progress after confirmation', async () => {
    progressStore.grade('人', 'good');
    render(() => <ProgressBackup />);

    const input = screen.getByLabelText('Importar copia') as HTMLInputElement;
    const file = new File(['backup'], 'progress.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(backup(4)) });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(/Reemplazar borra el progreso actual/);

    expect(progressStore.get('人')?.right).toBe(1);
    expect(progressStore.get('好')).toBeUndefined();

    const before = progressReset();
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar progreso' }));
    await waitFor(() => expect(progressStore.get('好')?.right).toBe(4));
    expect(progressStore.get('人')).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent('Copia restaurada.');
    expect(progressReset()).toBe(before + 1);
  });

  it('keeps progress unchanged when a selected file is invalid', async () => {
    progressStore.grade('人', 'good');
    render(() => <ProgressBackup />);

    const file = new File(['{'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue('{') });
    fireEvent.change(screen.getByLabelText('Importar copia'), {
      target: { files: [file] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('No se pudo leer la copia.');
    expect(progressStore.get('人')?.right).toBe(1);
  });

  it('ignores an older file read when the user selects another file', async () => {
    render(() => <ProgressBackup />);
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const first = new File(['first'], 'first.json');
    const second = new File(['second'], 'second.json');
    Object.defineProperty(first, 'text', { value: () => new Promise<string>((resolve) => { resolveFirst = resolve; }) });
    Object.defineProperty(second, 'text', { value: () => new Promise<string>((resolve) => { resolveSecond = resolve; }) });
    const input = screen.getByLabelText('Importar copia');

    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.change(input, { target: { files: [second] } });
    resolveSecond(backup(2));
    await screen.findByText(/Reemplazar borra el progreso actual/);
    resolveFirst('{');
    await Promise.resolve();

    expect(screen.queryByText('No se pudo leer la copia. Comprueba que sea un archivo de progreso válido.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar progreso' }));
    await waitFor(() => expect(progressStore.get('好')?.right).toBe(2));
  });

  it('offers confirmed recovery after storage reads start working again', async () => {
    localStorage.setItem('hsk-flashcards-stats', backup(2));
    vi.resetModules();
    const getItem = vi.spyOn(localStorage, 'getItem');
    getItem.mockImplementationOnce(() => { throw new Error('temporary read failure'); });
    const { progressStore: store } = await import('../src/stores/progressStore');
    const { progressReset: reset } = await import('../src/utils/progressReset');
    const { ProgressStorageNotice } = await import('../src/components/ProgressBackup');
    const testing = await import('@solidjs/testing-library');

    store.grade('人', 'good');
    const before = reset();
    testing.render(() => <ProgressStorageNotice />);
    testing.fireEvent.click(testing.screen.getByRole('button', { name: 'Recuperar progreso guardado' }));
    expect(testing.screen.getByText(/reemplazará el progreso actual/)).toBeTruthy();
    testing.fireEvent.click(testing.screen.getByRole('button', { name: 'Usar progreso guardado' }));

    expect(store.get('好')?.right).toBe(2);
    expect(store.get('人')).toBeUndefined();
    expect(reset()).toBe(before + 1);
    await testing.waitFor(() => expect(testing.screen.queryByRole('alert')).toBeNull());
  });
  it('restores word progress and discards the saved word session', async () => {
    vocabularyProgressStore.grade('hello', 'good');
    const saved = progressStore.exportBackup();
    progressStore.clear();
    vocabularyProgressStore.grade('other', 'good');
    const entry = { id: 'other', simplified: '你好', traditional: '你好', pinyin: 'nǐ hǎo', senses: [{ text: 'hello' }], level: 1 as const, characters: ['你', '好'], topicIds: [], sourceId: 'test' };
    saveVocabularySession({ version: 1, deck: [{ entry, kind: 'review' }], position: 0, revealed: false, step: 'ask', feedback: null, counts: { again: 0, hard: 0, good: 0 }, heading: 'Words' });
    render(() => <ProgressBackup />);
    const file = new File([saved], 'progress.json');
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(saved) });
    fireEvent.change(screen.getByLabelText('Importar copia'), { target: { files: [file] } });
    await screen.findByText(/contiene 0 registros de caracteres y 1 de palabras/);
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar progreso' }));
    expect(vocabularyProgressStore.get('hello')?.right).toBe(1);
    expect(vocabularyProgressStore.get('other')).toBeUndefined();
    expect(hasStoredVocabularySession()).toBe(false);
  });

  it('combines a backup with current progress, keeping the later copy of each record and ignoring legacy word lists', async () => {
    progressStore.grade('人', 'good');
    vocabularyProgressStore.grade('mine-here', 'good');
    const file = JSON.stringify({
      ...JSON.parse(backup(4)),
      // Older than this device's grade of 人, newer than nothing: 好 arrives, 人 stays.
      chars: { ...JSON.parse(backup(4)).chars, 人: { right: 9, updatedAt: 1, deviceId: 'other' } },
      words: { 'from-there': { right: 3, updatedAt: 1, deviceId: 'other' } },
      myWords: { version: 2, words: { [vocabulary[1].id]: { addedAt: 1, removedAt: null, updatedAt: 1, deviceId: 'other' } } },
    });
    render(() => <ProgressBackup />);
    const input = new File(['backup'], 'progress.json');
    Object.defineProperty(input, 'text', { value: vi.fn().mockResolvedValue(file) });
    fireEvent.change(screen.getByLabelText('Importar copia'), { target: { files: [input] } });
    await screen.findByText(/Combinarla conserva/);
    const before = progressReset();
    fireEvent.click(screen.getByRole('button', { name: 'Combinar con mi progreso' }));
    expect(progressStore.get('人')?.right).toBe(1);
    expect(progressStore.get('好')?.right).toBe(4);
    expect(vocabularyProgressStore.get('mine-here')?.right).toBe(1);
    expect(vocabularyProgressStore.get('from-there')?.right).toBe(3);
    expect(screen.getByRole('status')).toHaveTextContent('Copia combinada con tu progreso.');
    expect(progressReset()).toBe(before + 1);
  });

  it('keeps both histories and the word session if writing the import fails', async () => {
    vocabularyProgressStore.grade('existing', 'good');
    progressStore.grade('人', 'good');
    const stored = localStorage.getItem('hsk-flashcards-stats');
    localStorage.setItem('jiayou-vocabulary-session-v1', JSON.stringify({ version: 1 }));
    render(() => <ProgressBackup />);
    const file = new File(['backup'], 'progress.json');
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(backup(4)) });
    fireEvent.change(screen.getByLabelText('Importar copia'), { target: { files: [file] } });
    await screen.findByText(/contiene 1 registro de caracteres y 0 de palabras/);
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar progreso' }));
    write.mockRestore();
    expect(screen.getByRole('status')).toHaveTextContent('Tu progreso actual sigue disponible');
    expect(progressStore.get('人')?.right).toBe(1);
    expect(vocabularyProgressStore.get('existing')?.right).toBe(1);
    expect(localStorage.getItem('hsk-flashcards-stats')).toBe(stored);
    expect(hasStoredVocabularySession()).toBe(true);
  });

});
