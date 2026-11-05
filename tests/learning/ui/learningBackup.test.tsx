import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import LearningBackup, { MAX_BACKUP_BYTES, type LearningBackupProps } from '../../../src/components/learning/backup/LearningBackup';
import { createBackup } from '../../../src/domain/learning/backup';

const record = { right: 2, wrong: 1, reps: 1, lapses: 1, interval: 3, ease: 2.36, due: 4, strokeRuns: 1, strokeBest: 0, lastSeen: 1, clean: 1, lastReview: 1, updatedAt: 1, deviceId: 'device-a' };
const daily = { day: '2026-01-02', reviewed: 3, introduced: 1, streak: 2 };

/** The phase 4 file: a learning log next to a v4 character half, which import ignores. */
const combinedFile = JSON.stringify({
  learning: createBackup({ deviceId: 'device-a', exportedAt: 5, events: [], configs: [] }),
  legacyCharacters: { version: 4, chars: { 好: record, 人: record }, daily, activity: {} },
});

/** What the app exports now: the learning log alone. */
const learningFile = JSON.stringify(createBackup({ deviceId: 'device-a', exportedAt: 5, events: [], configs: [] }));

/** A v4 file with word progress, which import ignores with a warning. */
const v4File = JSON.stringify({ version: 4, chars: { 好: record }, daily, words: { 'word-x': record }, wordDaily: daily, activity: {} });

const mocks = (overrides: Partial<LearningBackupProps> = {}) => ({
  exportBackup: vi.fn().mockResolvedValue(learningFile),
  mergeBackup: vi.fn().mockResolvedValue({ ok: true, added: 3, warnings: [] }),
  replaceBackup: vi.fn().mockResolvedValue({ ok: true, added: 3, warnings: [] }),
  ...overrides,
});

const choose = (text: string) => {
  const file = new File(['backup'], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(text) });
  fireEvent.change(screen.getByLabelText('Importar copia'), { target: { files: [file] } });
};

describe('learning backup UI', () => {
  let click: MockInstance<[], void>;
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:backup'), revokeObjectURL: vi.fn() });
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('downloads the learning backup the export returns', async () => {
    const props = mocks();
    render(() => <LearningBackup {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar progreso' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(props.exportBackup).toHaveBeenCalledTimes(1);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(text).toBe(learningFile);
    const link = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(link.download).toBe('jiayou-progreso.json');
  });

  it('says so when the export fails', async () => {
    render(() => <LearningBackup {...mocks({ exportBackup: vi.fn().mockRejectedValue(new Error('locked')) })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar progreso' }));
    expect(await screen.findByRole('status')).toHaveTextContent('No se pudo exportar la copia.');
    expect(click).not.toHaveBeenCalled();
  });

  it('merges a valid file by default', async () => {
    const props = mocks();
    render(() => <LearningBackup {...props} />);
    choose(combinedFile);
    await screen.findByText(/La copia tiene 0 registros de aprendizaje\. Combinarla/);
    expect(screen.getByText(/progreso antiguo de 2 caracteres, que no se importa/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Combinar con mi progreso' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copia combinada con tu progreso. 3 registros nuevos.');
    expect(props.mergeBackup).toHaveBeenCalledWith(combinedFile);
    expect(props.replaceBackup).not.toHaveBeenCalled();
  });

  it('replaces only after a second confirmation', async () => {
    const props = mocks();
    render(() => <LearningBackup {...props} />);
    choose(combinedFile);
    fireEvent.click(await screen.findByRole('button', { name: 'Reemplazar progreso' }));
    expect(props.replaceBackup).not.toHaveBeenCalled();
    expect(screen.getByText(/Reemplazar borra el progreso de este dispositivo/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('button', { name: 'Sí, reemplazar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar progreso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Copia restaurada.');
    expect(props.replaceBackup).toHaveBeenCalledWith(combinedFile);
    expect(props.mergeBackup).not.toHaveBeenCalled();
  });

  it('shows the Spanish errors of an invalid file and writes nothing', async () => {
    const props = mocks();
    render(() => <LearningBackup {...props} />);
    choose(JSON.stringify({ learning: {}, extra: 1 }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Esta copia no es válida. Tu progreso no ha cambiado.');
    expect(status).toHaveTextContent('El campo extra no forma parte del formato');
    expect(screen.queryByRole('button', { name: 'Combinar con mi progreso' })).toBeNull();
    expect(props.mergeBackup).not.toHaveBeenCalled();
    expect(props.replaceBackup).not.toHaveBeenCalled();
  });

  it('refuses a file over 100 MB without reading it', async () => {
    const props = mocks();
    render(() => <LearningBackup {...props} />);
    const file = new File(['x'], 'huge.json', { type: 'application/json' });
    const text = vi.fn().mockResolvedValue(learningFile);
    Object.defineProperty(file, 'text', { value: text });
    Object.defineProperty(file, 'size', { value: MAX_BACKUP_BYTES + 1 });
    fireEvent.change(screen.getByLabelText('Importar copia'), { target: { files: [file] } });
    expect(await screen.findByRole('status')).toHaveTextContent('El archivo es demasiado grande para ser una copia de progreso (más de 100 MB).');
    expect(text).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Combinar con mi progreso' })).toBeNull();
  });

  it('rejects a file that is not JSON', async () => {
    const props = mocks();
    render(() => <LearningBackup {...props} />);
    choose('{');
    expect(await screen.findByRole('status')).toHaveTextContent('Esta copia no es válida.');
    expect(props.mergeBackup).not.toHaveBeenCalled();
  });

  it('lists the errors the store returns', async () => {
    const props = mocks({ mergeBackup: vi.fn().mockResolvedValue({ ok: false, errors: [{ message: 'El evento e1 aparece con dos contenidos distintos' }] }) });
    render(() => <LearningBackup {...props} />);
    choose(combinedFile);
    fireEvent.click(await screen.findByRole('button', { name: 'Combinar con mi progreso' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('No se pudo usar la copia. Tu progreso no ha cambiado.');
    expect(status).toHaveTextContent('El evento e1 aparece con dos contenidos distintos');
  });

  it('shows the warnings of an old file before and after merging', async () => {
    const props = mocks({ mergeBackup: vi.fn().mockResolvedValue({ ok: true, added: 0, warnings: ['Se ignoró el progreso de 1 palabra.'] }) });
    render(() => <LearningBackup {...props} />);
    choose(v4File);
    await screen.findByText(/La copia es del formato antiguo y no trae progreso que importar\./);
    expect(screen.getByText(/progreso antiguo de 1 carácter y 1 palabra/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Combinar con mi progreso' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Copia combinada. No traía nada que no tuvieras ya.');
    expect(status).toHaveTextContent('Se ignoró el progreso de 1 palabra.');
  });

  it('ignores an older file read when another file is chosen', async () => {
    const props = mocks();
    render(() => <LearningBackup {...props} />);
    let resolveFirst!: (value: string) => void;
    const first = new File(['first'], 'first.json');
    Object.defineProperty(first, 'text', { value: () => new Promise<string>((resolve) => { resolveFirst = resolve; }) });
    fireEvent.change(screen.getByLabelText('Importar copia'), { target: { files: [first] } });
    choose(combinedFile);
    await screen.findByText(/La copia tiene/);
    resolveFirst('{');
    await Promise.resolve();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Combinar con mi progreso' })).toBeTruthy();
  });
});
