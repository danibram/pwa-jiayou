import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MisPalabras from '../src/pages/MisPalabras';
import { myWordsStore } from '../src/stores/myWordsStore';
import { vocabularyStore } from '../src/stores/vocabularyStore';

vi.mock('../src/utils/levelPacks', async (original) => ({ ...(await original<object>()), saveStudyMedia: async () => [] }));

afterEach(() => {
  myWordsStore.reset();
  vocabularyStore.reset();
  localStorage.clear();
});

describe('Mis palabras page', () => {
  it('adds a word typed syllable by syllable, and lists it', () => {
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir palabra' }));
    fireEvent.input(screen.getByLabelText('Palabra'), { target: { value: '奶茶' } });
    fireEvent.input(screen.getByLabelText('Sílaba de 奶'), { target: { value: 'nai3' } });
    fireEvent.input(screen.getByLabelText('Sílaba de 茶'), { target: { value: 'cha2' } });
    fireEvent.input(screen.getByLabelText('Significado'), { target: { value: 'té con leche' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(screen.getByRole('status')).toHaveTextContent('奶茶 añadida.');
    expect(screen.getByRole('button', { name: 'Quitar 奶茶 de tu lista' })).toBeTruthy();
    expect(myWordsStore.ownWords()[0]?.topicIds).toEqual(['comida']);
    expect(screen.getByRole('list', { name: 'Mis palabras' })).toHaveTextContent('Comida');
  });

  it('warns and preloads an HSK word, then adds it on confirm', () => {
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir palabra' }));
    fireEvent.input(screen.getByLabelText('Palabra'), { target: { value: '朋友' } });
    expect(screen.getByText(/Ya está en HSK/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /朋友.*amigo/ }));
    expect(screen.getByLabelText('Significado')).toHaveValue('amigo; amiga');
    expect(myWordsStore.ids).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(screen.getByRole('status')).toHaveTextContent('HSK 1');
    expect(myWordsStore.ids).toEqual(['word-670b-53cb-peng2-you5']);
    expect(myWordsStore.ownWords()).toEqual([]);
  });

  it('lets you correct a preloaded HSK word before adding', () => {
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir palabra' }));
    fireEvent.input(screen.getByLabelText('Palabra'), { target: { value: '朋友' } });
    fireEvent.click(screen.getByRole('button', { name: /朋友.*amigo/ }));
    fireEvent.input(screen.getByLabelText('Significado'), { target: { value: 'colega' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(screen.getByRole('status')).toHaveTextContent('corrección');
    expect(myWordsStore.isCorrection('word-670b-53cb-peng2-you5')).toBe(true);
    expect(myWordsStore.words()[0]?.meaning).toBe('colega');
  });

  it('says what is wrong instead of saving', () => {
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir palabra' }));
    fireEvent.input(screen.getByLabelText('Palabra'), { target: { value: '咖喱' } });
    fireEvent.input(screen.getByLabelText('Sílaba de 咖'), { target: { value: 'kali' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(screen.getByRole('alert')).toHaveTextContent('una sílaba de pinyin por carácter');
    expect(myWordsStore.ids).toEqual([]);
  });

  it('opens a listed own word in the edit drawer and saves changes', () => {
    myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche', topicIds: ['comida'] });
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /奶茶.*té con leche/ }));
    expect(screen.getByRole('heading', { name: 'Editar palabra' })).toBeTruthy();
    expect(screen.getByLabelText('Palabra')).toHaveValue('奶茶');
    expect(screen.getByLabelText('Significado')).toHaveValue('té con leche');
    fireEvent.input(screen.getByLabelText('Significado'), { target: { value: 'bubble tea' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('status')).toHaveTextContent('奶茶 guardada.');
    expect(myWordsStore.ownWords()[0]?.meaning).toBe('bubble tea');
    expect(myWordsStore.ids).toHaveLength(1);
  });

  it('opens a listed HSK word for correction and can open its card', () => {
    const onOpenWord = vi.fn();
    myWordsStore.addCatalog('word-670b-53cb-peng2-you5');
    render(() => <MisPalabras onBack={() => {}} onOpenWord={onOpenWord} />);
    fireEvent.click(screen.getByRole('button', { name: /朋友.*amigo/ }));
    expect(screen.getByRole('heading', { name: 'Palabra de HSK' })).toBeTruthy();
    expect(screen.getByText(/Ya está en HSK/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Significado'), { target: { value: 'colega' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('status')).toHaveTextContent('corregida');
    expect(myWordsStore.words()[0]?.meaning).toBe('colega');
    fireEvent.click(screen.getByRole('button', { name: /朋友.*colega/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha' }));
    expect(onOpenWord).toHaveBeenCalledWith('word-670b-53cb-peng2-you5');
  });

  it('removes a listed word', () => {
    myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar 奶茶 de tu lista' }));
    expect(myWordsStore.ids).toHaveLength(0);
  });

  it('reviews a pasted list before adding it', () => {
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    expect(screen.queryByLabelText('Lista')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pegar una lista' }));
    const list = '奶茶\tnai3cha2\tté con leche\n朋友\tpeng2 you5\n咖喱\tkali\tcurry';
    fireEvent.input(screen.getByLabelText('Lista'), { target: { value: list } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText('Se añadirán 2 palabras.', { exact: false })).toBeTruthy();
    expect(screen.getByText(/Línea 3:/)).toBeTruthy();
    expect(myWordsStore.ids).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir 2 palabras' }));
    expect(screen.getByRole('status')).toHaveTextContent('2 palabras añadidas');
    expect(screen.getByRole('status')).toHaveTextContent('1 es de HSK');
    expect(myWordsStore.ids).toEqual(['word-5976-8336-nai3-cha2', 'word-670b-53cb-peng2-you5']);
  });

  it('shares the list as plain text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText: vi.fn() } });
    myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir lista' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lista compartida');
    expect(share).toHaveBeenCalledWith({
      title: 'Mis palabras · Jiāyóu',
      text: '奶茶\tté con leche',
    });
    vi.unstubAllGlobals();
  });

  it('toasts when the list is copied to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    render(() => <MisPalabras onBack={() => {}} onOpenWord={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir lista' }));
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Lista copiada');
    expect(toast).toHaveTextContent('Pégala donde quieras');
    expect(writeText).toHaveBeenCalledWith('奶茶\tté con leche');
    vi.unstubAllGlobals();
  });
});
