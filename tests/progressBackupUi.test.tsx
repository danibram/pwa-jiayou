import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProgressBackup from '../src/components/ProgressBackup';
import { progressStore } from '../src/stores/progressStore';
import { progressReset } from '../src/utils/progressReset';

const backup = (right: number) => JSON.stringify({
  version: 2,
  chars: { 好: { right, wrong: 0, reps: right, lapses: 0, interval: 1, ease: 2.5, due: 1, strokeRuns: 0, strokeBest: null, lastSeen: 1 } },
  daily: { day: '2026-10-31', reviewed: right, introduced: 0, streak: 1 },
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
    await screen.findByText(/La copia reemplazará el progreso actual/);

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
    await screen.findByText(/La copia reemplazará el progreso actual/);
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
});
