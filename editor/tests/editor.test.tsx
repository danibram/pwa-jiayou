import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Editor from '../Editor';

const base = {
  schemaVersion: 1,
  vocabulary: [{ id: 'word-1', simplified: '好', traditional: '好', pinyin: 'hǎo', meaning: 'bueno', level: 1, characters: ['好'], topicIds: [], sourceId: 'hsk-2-0' }],
  characters: ['好', '一', '二', '三', '四', '五'].map((character, index) => ({ character, traditional: character, pinyin: 'hǎo', definition: 'bueno', radical: '女', stroke_count: 6, hsk_level: 1, general_standard: index + 1, frequency_rank: index + 1 })),
  topics: [{ id: 'saludos', title: 'Saludos', glyph: '好', characters: ['好', '一', '二', '三', '四'] }],
};
const version = { version: 3, date: '2026-11-03', notes: 'Tercera.' };

const mockFetch = (serverAvailable = false) => vi.fn(async (url: string, init?: RequestInit) => {
  if (url.includes('__content/status')) return { ok: serverAvailable, json: async () => ({ available: serverAvailable }) };
  if (url.includes('__content/plan')) return { ok: true, json: async () => ({ files: ['content/snapshot.json', 'src/data/vocabulary/hsk1.json'], version }) };
  if (url.includes('__content/promote')) {
    const body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ version: { version: 4, date: '2026-11-04', notes: body.notes }, files: ['content/snapshot.json', 'content/version.json'], revision: 'rev-2' }) };
  }
  if (url.endsWith('revision.json')) return { ok: true, json: async () => ({ revision: 'rev-1' }) };
  if (url.endsWith('version.json')) return { ok: true, json: async () => version };
  return { ok: true, json: async () => structuredClone(base) };
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', mockFetch());
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

const openWord = async (pinyin = 'hǎo') => fireEvent.click(await screen.findByRole('button', { name: new RegExp(`好.*${pinyin}`) }));

describe('content editor', () => {
  it('saves edits without changing the word ID and restores the draft', async () => {
    const view = render(() => <Editor />);
    await openWord();
    fireEvent.input(screen.getByLabelText('Sílaba de 好'), { target: { value: 'hao4' } });
    fireEvent.input(screen.getByLabelText('Traducción'), { target: { value: 'bien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    const saved = JSON.parse(localStorage.getItem('jiayou-content-draft-v1')!);
    expect(saved.snapshot.vocabulary[0]).toMatchObject({ id: 'word-1', pinyin: 'hào', meaning: 'bien' });
    view.unmount();
    render(() => <Editor />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Borrador guardado'));
    await openWord('hào');
    expect(screen.getByLabelText('Traducción')).toHaveValue('bien');
  });

  it('shows the content version and keeps changes in memory when storage fails', async () => {
    render(() => <Editor />);
    await openWord();
    expect(screen.getByText(/contenido v3/)).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText('Traducción'), { target: { value: 'bien' } });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('sin espacio'); });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(screen.getByRole('alert')).toHaveTextContent('sin espacio');
    expect(screen.getByLabelText('Traducción')).toHaveValue('bien');
  });

  it('keeps focus while typing several characters and assigns filtered words to a topic', async () => {
    render(() => <Editor />);
    await openWord();
    const input = screen.getByLabelText('Traducción') as HTMLTextAreaElement;
    input.focus();
    for (const value of ['a', 'am', 'amo']) fireEvent.input(input, { target: { value } });
    expect(document.activeElement).toBe(input);
    expect(screen.getByLabelText('Traducción')).toHaveValue('amo');
    fireEvent.click(screen.getByRole('button', { name: 'Temas' }));
    fireEvent.click(screen.getByRole('button', { name: /好.*Saludos/ }));
    fireEvent.input(screen.getByLabelText('Buscar palabras del tema'), { target: { value: 'amo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Asignar resultados' }));
    expect(screen.getByRole('checkbox', { name: /好.*amo/ })).toBeChecked();
  });

  it('confirms before discarding changes and warns before leaving', async () => {
    render(() => <Editor />);
    await openWord();
    fireEvent.input(screen.getByLabelText('Traducción'), { target: { value: 'bien' } });
    const event = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(event)).toBe(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    await openWord();
    expect(screen.getByLabelText('Traducción')).toHaveValue('bueno');
  });

  it('derives a new topic id from its title and lists the change in the review', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(() => <Editor />);
    await screen.findByRole('button', { name: /好.*hǎo/ });
    fireEvent.click(screen.getByRole('button', { name: 'Temas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo tema' }));
    fireEvent.input(screen.getByLabelText('Nombre'), { target: { value: 'Números' } });
    fireEvent.input(screen.getByLabelText('Carácter representativo'), { target: { value: '一' } });
    fireEvent.input(screen.getByLabelText('Añadir caracteres'), { target: { value: '一二三四五' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(screen.getByText('Tema · numeros')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText('1 elemento modificado.')).toBeInTheDocument();
    expect(screen.getByText('Tema nuevo')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar para publicar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Archivo de publicación descargado');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('promotes the draft through the dev server and starts from the new base', async () => {
    vi.stubGlobal('fetch', mockFetch(true));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(() => <Editor />);
    await openWord();
    fireEvent.input(screen.getByLabelText('Traducción'), { target: { value: 'bien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    await screen.findByText('content/snapshot.json');
    fireEvent.input(screen.getByLabelText('Qué cambia en esta versión'), { target: { value: 'Traduce 好 como bien.' } });
    const button = await screen.findByRole('button', { name: 'Promover a la versión 4' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('promovido a la versión 4'));
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => String(url).includes('__content/promote'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ notes: 'Traduce 好 como bien.', draft: { baseRevision: 'rev-1' } });
    expect(localStorage.getItem('jiayou-content-draft-v1')).toBeNull();
    expect(screen.getByText(/contenido v4/)).toBeInTheDocument();
    expect(screen.getByText('El borrador coincide con el contenido publicado.')).toBeInTheDocument();
  });

  it('edits pinyin by syllable and tone, keeps capitals and tags topics with chips', async () => {
    render(() => <Editor />);
    await openWord();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tono de 好' })).getByRole('radio', { name: '·' }));
    expect(screen.getByRole('button', { name: /好.*hao/ })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tono de 好' })).getByRole('radio', { name: '3' }));
    const chip = screen.getByRole('checkbox', { name: /Saludos/ });
    expect(chip).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Editar como texto' }));
    fireEvent.input(screen.getByLabelText('Pinyin'), { target: { value: 'Hǎo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Editar por sílabas' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tono de 好' })).getByRole('radio', { name: '4' }));
    expect(screen.getByRole('button', { name: /好.*Hào/ })).toBeInTheDocument();
  });

  it('links a synonym on both words and shows it in the review diff', async () => {
    const rich = structuredClone(base);
    rich.vocabulary.push({
      id: 'word-2',
      simplified: '佳',
      traditional: '佳',
      pinyin: 'jiā',
      meaning: 'bueno; excelente',
      level: 1,
      characters: ['佳'],
      topicIds: [],
      sourceId: 'hsk-2-0',
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('__content/status')) return { ok: false, json: async () => ({ available: false }) };
      if (url.endsWith('revision.json')) return { ok: true, json: async () => ({ revision: 'rev-1' }) };
      if (url.endsWith('version.json')) return { ok: true, json: async () => version };
      return { ok: true, json: async () => structuredClone(rich) };
    }));
    render(() => <Editor />);
    await openWord();
    fireEvent.input(screen.getByLabelText('Buscar sinónimos'), { target: { value: 'excelente' } });
    const hits = await screen.findByRole('listbox', { name: 'Resultados' });
    fireEvent.click(within(hits).getByRole('button', { name: /佳/ }));
    expect(screen.getByRole('button', { name: /Quitar 佳 de sinónimos/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    const saved = JSON.parse(localStorage.getItem('jiayou-content-draft-v1')!);
    expect(saved.snapshot.vocabulary.find((w: { id: string }) => w.id === 'word-1').relations).toEqual([{ kind: 'synonym', id: 'word-2' }]);
    expect(saved.snapshot.vocabulary.find((w: { id: string }) => w.id === 'word-2').relations).toEqual([{ kind: 'synonym', id: 'word-1' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText(/Sinónimos: 佳/)).toBeInTheDocument();
  });

  it('points a new word that already exists to the existing entry', async () => {
    render(() => <Editor />);
    await screen.findByRole('button', { name: /好.*hǎo/ });
    fireEvent.click(screen.getByRole('button', { name: 'Nueva palabra' }));
    fireEvent.input(screen.getByLabelText('Simplificado'), { target: { value: 'a好b' } });
    expect(screen.getByLabelText('Simplificado')).toHaveValue('好');
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('好 ya existe.');
    expect(notice).toHaveTextContent('bueno');
    fireEvent.click(within(notice).getByRole('button', { name: 'Editar esta palabra' }));
    expect(screen.getByLabelText('Traducción')).toHaveValue('bueno');
    expect(screen.queryByRole('button', { name: /Palabra nueva/ })).toBeNull();
  });

  it('files a new word under the filtered level, lists it first and finds it again under Extra', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(() => <Editor />);
    await screen.findByRole('button', { name: /好.*hǎo/ });
    fireEvent.click(screen.getByRole('button', { name: 'HSK 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nueva palabra' }));
    expect(within(screen.getByRole('radiogroup', { name: 'Lista' })).getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.input(screen.getByLabelText('Simplificado'), { target: { value: '你好' } });
    fireEvent.input(screen.getByLabelText('Sílaba de 你'), { target: { value: 'ni3' } });
    fireEvent.input(screen.getByLabelText('Sílaba de 好'), { target: { value: 'hao3' } });
    fireEvent.input(screen.getByLabelText('Traducción'), { target: { value: 'hola' } });
    vi.advanceTimersByTime(1000);
    const saved = JSON.parse(localStorage.getItem('jiayou-content-draft-v1')!);
    const word = saved.snapshot.vocabulary.find((w: { simplified: string }) => w.simplified === '你好');
    expect(word).toMatchObject({ id: 'word-4f60-597d-ni3-hao3', level: 2, pinyin: 'nǐ hǎo', meaning: 'hola' });
    fireEvent.click(screen.getByRole('radio', { name: 'Extra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Extra' }));
    const rows = screen.getAllByRole('button', { name: /hola|bueno/ });
    expect(rows[0]).toHaveTextContent('你好');
    expect(rows[0]).toHaveTextContent('Nueva');
    expect(screen.queryByRole('button', { name: /好.*bueno/ })).toBeNull();
    vi.useRealTimers();
  });

  it('moves a published word to another list and says progress is kept', async () => {
    render(() => <Editor />);
    await openWord();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Lista' })).getByRole('radio', { name: '3' }));
    expect(screen.getByText(/Pasa de HSK 1 a HSK 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText('HSK 3')).toBeInTheDocument();
  });
});
