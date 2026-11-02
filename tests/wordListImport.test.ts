import { afterEach, describe, expect, it, vi } from 'vitest';
import { myWordsStore } from '../src/stores/myWordsStore';
import {
  formatMyWordsList,
  formatWordList,
  numberedPinyin,
  numberedPinyinFromWordId,
  parseWordList,
  shareWordListText,
  wordKind,
} from '../src/utils/wordListImport';

afterEach(() => {
  myWordsStore.reset();
  localStorage.clear();
});

const value = (text: string) => {
  const [row] = parseWordList(text);
  if (!row?.ok) throw new Error(row && 'error' in row ? row.error : 'no line');
  return row.value;
};

describe('parseWordList', () => {
  it.each([
    ['tab', '奶茶\tnai3 cha2\tté con leche'],
    ['slash', '奶茶 / nai3 cha2 / té con leche'],
    ['semicolon', '奶茶; nai3 cha2; té con leche'],
    ['hyphen', '奶茶 - nai3 cha2 - té con leche'],
    ['en dash', '奶茶 – nai3 cha2 – té con leche'],
  ])('reads a line separated by %s', (_name, line) => {
    expect(value(line)).toEqual({ simplified: '奶茶', traditional: '奶茶', pinyin: 'nǎi chá', meaning: 'té con leche', topicIds: [] });
  });

  it('keeps separators that belong to the meaning', () => {
    expect(value('奶茶 / nai3 cha2 / té; con leche / frío').meaning).toBe('té; con leche / frío');
  });

  it('splits Pleco pinyin written with tone numbers and no spaces', () => {
    expect(value('奶茶\tnai3cha2\tté con leche').pinyin).toBe('nǎi chá');
    expect(value('朋友\tpeng2you\tcolega').pinyin).toBe('péng you');
  });

  it('takes the meaning from HSK when the line has none', () => {
    expect(value('朋友\tpeng2 you5')).toMatchObject({ simplified: '朋友', meaning: 'amigo; amiga' });
    expect(value('朋友 / péng you')).toMatchObject({ meaning: 'amigo; amiga' });
  });

  it('fills HSK pinyin when the line is only hanzi, or hanzi and meaning', () => {
    expect(value('朋友')).toMatchObject({ simplified: '朋友', pinyin: 'péng you', meaning: 'amigo; amiga' });
    expect(value('朋友\tamigo; amiga')).toMatchObject({
      simplified: '朋友',
      pinyin: 'péng you',
      meaning: 'amigo; amiga',
    });
  });

  it('asks for a meaning when the word is not in HSK', () => {
    const [row] = parseWordList('奶茶\tnai3 cha2');
    expect(row).toMatchObject({ ok: false, line: 1, error: 'Escribe el significado.' });
  });

  it('fills pinyin from the character index when hanzi plus meaning is outside HSK', () => {
    expect(value('奶茶\tté con leche')).toMatchObject({ simplified: '奶茶', pinyin: 'nǎi chá', meaning: 'té con leche' });
    expect(value('程序员\tprogramador')).toMatchObject({
      simplified: '程序员',
      pinyin: 'chéng xù yuán',
      meaning: 'programador',
    });
  });

  it('asks for pinyin when a character has no known reading', () => {
    const [row] = parseWordList('咖喱\tcurry');
    expect(row).toMatchObject({ ok: false, line: 1, error: 'No está en HSK: añade el pinyin y el significado.' });
  });

  it('reports bad lines with their number and the form message', () => {
    const rows = parseWordList('奶茶\tnai3 cha2\tté\ncafe\tka fei\tcafé\n咖喱\tkali\tcurry\nsolo');
    expect(rows.map((row) => row.ok)).toEqual([true, false, false, false]);
    expect(rows[1]).toMatchObject({ line: 2, error: 'Escribe la palabra en caracteres chinos.' });
    expect(rows[2]).toMatchObject({ line: 3, error: expect.stringContaining('una sílaba de pinyin por carácter') });
    expect(rows[3]).toMatchObject({ line: 4, error: 'No está en HSK: añade el pinyin y el significado.' });
  });

  it('skips blank and comment lines but keeps real line numbers', () => {
    const rows = parseWordList('# mi lista\r\n\r\n奶茶\tnai3 cha2\tté\n   \n# otra\n咖啡\tka1 fei1\tcafé');
    expect(rows.map((row) => row.line)).toEqual([3, 6]);
    expect(rows.every((row) => row.ok)).toBe(true);
  });

  it('does not write to the store', () => {
    parseWordList('奶茶\tnai3 cha2\tté con leche');
    expect(myWordsStore.ids).toEqual([]);
  });
});

describe('formatWordList', () => {
  it('writes numbered pinyin with tabs so parseWordList can read it back', () => {
    const text = formatWordList([
      { simplified: '奶茶', pinyin: 'nǎi chá', meaning: 'té con leche' },
      { simplified: '朋友', pinyin: 'péng you', meaning: 'amigo; amiga' },
    ]);
    expect(text).toBe('奶茶\tnai3 cha2\tté con leche\n朋友\tpeng2 you5\tamigo; amiga');
    expect(parseWordList(text).map((row) => row.ok && row.value.simplified)).toEqual(['奶茶', '朋友']);
  });

  it('numbers tone 1 explicitly', () => {
    expect(numberedPinyin('mā ma')).toBe('ma1 ma5');
  });

  it('reads dictionary tones from a catalog word id', () => {
    expect(numberedPinyinFromWordId('word-670b-53cb-peng2-you5', '朋友')).toBe('peng2 you5');
  });
});

describe('formatMyWordsList', () => {
  it('skips pinyin when HSK or the character index can rebuild it', () => {
    myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    myWordsStore.add({ simplified: '程序员', pinyin: 'cheng2 xu4 yuan2', meaning: 'programador' });
    myWordsStore.add({ simplified: '咖喱', pinyin: 'ka1 li1', meaning: 'curry' });
    myWordsStore.addCatalog('word-670b-53cb-peng2-you5');
    const text = formatMyWordsList();
    expect(text).toBe('奶茶\tté con leche\n程序员\tprogramador\n咖喱\tka1 li1\tcurry\n朋友\tamigo; amiga');
    const rows = parseWordList(text);
    expect(rows.every((row) => row.ok)).toBe(true);
    expect(rows.filter((row) => row.ok).map((row) => wordKind(row.value))).toEqual([
      { id: 'word-5976-8336-nai3-cha2', inCatalog: false },
      { id: 'word-7a0b-5e8f-5458-cheng2-xu4-yuan2', inCatalog: false },
      { id: 'word-5496-55b1-ka-li', inCatalog: false },
      { id: 'word-670b-53cb-peng2-you5', inCatalog: true },
    ]);
  });
});

describe('shareWordListText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Web Share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    await expect(shareWordListText('奶茶\tnai3 cha2\tté')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Mis palabras · Jiāyóu', text: '奶茶\tnai3 cha2\tté' });
  });

  it('copies when share is missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(shareWordListText('lista')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('lista');
  });

  it('copies when share fails for a reason other than cancel', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
      clipboard: { writeText },
    });
    await expect(shareWordListText('lista')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('lista');
  });
});
