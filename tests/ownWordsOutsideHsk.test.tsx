import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Pinyin from '../src/components/Pinyin';
import Vocabulario from '../src/pages/Vocabulario';
import { MY_WORDS_LIST } from '../src/data/lists';
import { myWordsStore } from '../src/stores/myWordsStore';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { characterOrWordStub } from '../src/utils/wordCharacter';

vi.mock('../src/components/CharacterGlyph', () => ({ default: (props: { char: string }) => <div>{props.char}</div> }));

afterEach(() => {
  myWordsStore.reset();
  vocabularyStore.reset();
  localStorage.clear();
});

const browse = { query: '', topic: '', scroll: 0, choosingTopic: false };
const page = (props: { wordId?: string; onSelect?: (id?: string) => void; onStrokes?: (char: string) => void; query?: string; topic?: string }) =>
  render(() => (
    <Vocabulario
      onBack={() => {}}
      onStrokes={props.onStrokes ?? (() => {})}
      wordId={props.wordId}
      onSelect={props.onSelect ?? (() => {})}
      onPractice={() => {}}
      browse={{ ...browse, query: props.query ?? '', topic: props.topic ?? '' }}
      onBrowse={() => {}}
    />
  ));

describe('pinyin of the learner\'s own words', () => {
  const text = () => document.querySelector('[lang="zh-Latn-pinyin"]')?.textContent;

  it('writes an own word together, like a catalog word, and follows the list as it changes', () => {
    render(() => <Pinyin text="kā lí" />);
    expect(text()).toBe('kā lí');
    myWordsStore.add({ simplified: '咖喱', pinyin: 'ka1 li2', meaning: 'curry' });
    expect(text()).toBe('kālí');
    myWordsStore.reset();
    expect(text()).toBe('kā lí');
  });

  it('keeps the rule that a word ending in a particle stays apart', () => {
    myWordsStore.add({ simplified: '好吗', pinyin: 'hao3 ma5', meaning: 'ok' });
    render(() => <Pinyin text="hǎo ma" />);
    expect(text()).toBe('hǎo ma');
  });
});

describe('a character outside HSK', () => {
  it('has a stub from the word that uses it, without level or radical', () => {
    expect(characterOrWordStub('喱', [])).toBeUndefined();
    myWordsStore.add({ simplified: '咖喱', pinyin: 'ka1 li2', meaning: 'curry; sauce' });
    const stub = characterOrWordStub('喱', [])!;
    expect(stub).toMatchObject({ character: '喱', pinyin: 'lí', gloss: 'en 咖喱: curry', radical: '', stroke_count: 0 });
    expect(stub.hsk_level).toBeUndefined();
  });

  it('opens a sheet from the word page, with its meaning, other words and strokes', () => {
    const { word } = myWordsStore.add({ simplified: '咖喱', pinyin: 'ka1 li2', meaning: 'curry' });
    myWordsStore.add({ simplified: '喱', pinyin: 'li2', meaning: 'gel' });
    const onStrokes = vi.fn();
    page({ wordId: word.id, onStrokes });
    fireEvent.click(screen.getByRole('button', { name: 'Ver el carácter 喱, 2 de 2' }));
    const sheet = screen.getByRole('dialog');
    expect(sheet.textContent).toContain('en 咖喱: curry');
    expect(sheet.textContent).not.toMatch(/HSK|Radical|Descargar/);
    expect(sheet.textContent).toContain('Palabras con');
    expect(sheet.textContent).toContain('gel');
    fireEvent.click(screen.getByRole('button', { name: /Ver trazos y escribirlo/ }));
    expect(onStrokes).toHaveBeenCalledWith('喱');
  });

  it('keeps the same label on every glyph, HSK or not', () => {
    const { word } = myWordsStore.add({ simplified: '咖喱', pinyin: 'ka1 li2', meaning: 'curry' });
    page({ wordId: word.id });
    expect(screen.getAllByRole('button', { name: /^Ver el carácter / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Practicar trazos/ })).toBeNull();
  });

  it('opens an own one-character word on its word page from search', () => {
    vi.useFakeTimers();
    const { word } = myWordsStore.add({ simplified: '喱', pinyin: 'li2', meaning: 'gel' });
    const onSelect = vi.fn();
    page({ onSelect, query: '喱' });
    fireEvent.click(screen.getAllByText('喱')[0]);
    expect(onSelect).toHaveBeenCalledWith(word.id);
    expect(screen.queryByRole('dialog')).toBeNull();
    vi.useRealTimers();
  });

  it('lists characters of an own word inside its topic', () => {
    vocabularyStore.selectLists([MY_WORDS_LIST]);
    myWordsStore.add({ simplified: '咖喱', pinyin: 'ka1 li2', meaning: 'curry', topicIds: ['comida'] });
    page({ topic: 'comida' });
    expect(screen.getByText('咖喱')).toBeTruthy();
    expect(screen.getByLabelText(/Carácter 咖/)).toBeTruthy();
    expect(screen.getByLabelText(/Carácter 喱/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Carácter 喱/));
    expect(screen.getByRole('dialog').textContent).toContain('en 咖喱: curry');
  });

  it('shows an own topic word in Temas even when Mis palabras is not checked', () => {
    vocabularyStore.selectLists(['hsk-1']);
    myWordsStore.add({ simplified: '程序员', pinyin: 'cheng2 xu4 yuan2', meaning: 'programador', topicIds: ['trabajos'] });
    expect(vocabularyStore.isSelected(MY_WORDS_LIST)).toBe(false);
    page({ topic: 'trabajos' });
    expect(screen.getByText('程序员')).toBeTruthy();
    expect(screen.getByLabelText(/Carácter 程/)).toBeTruthy();
  });
});
