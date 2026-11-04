import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Pinyin from '../src/components/Pinyin';
import Vocabulario from '../src/pages/Vocabulario';
import { EXTRA_LIST } from '../src/data/lists';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { characterOrWordStub } from '../src/utils/wordCharacter';

vi.mock('../src/data/vocabulary/extra.json', async () => ({ default: (await import('./fixtures/extraWords')).extraWords }));
vi.mock('../src/components/CharacterGlyph', () => ({ default: (props: { char: string }) => <div>{props.char}</div> }));

afterEach(() => {
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

describe('pinyin of Extra words', () => {
  const text = () => document.querySelector('[lang="zh-Latn-pinyin"]')?.textContent;

  it('writes an Extra word together, like an HSK word', () => {
    render(() => <Pinyin text="kā lí" />);
    expect(text()).toBe('kālí');
  });

  it('keeps the rule that a word ending in a particle stays apart', () => {
    render(() => <Pinyin text="hǎo ma" />);
    expect(text()).toBe('hǎo ma');
  });
});

describe('a character outside HSK', () => {
  it('has a stub from the word that uses it, without level or radical', () => {
    const stub = characterOrWordStub('喱', [])!;
    expect(stub).toMatchObject({ character: '喱', pinyin: 'lí', gloss: 'en 咖喱: curry', radical: '', stroke_count: 0 });
    expect(stub.hsk_level).toBeUndefined();
  });

  it('opens a sheet from the word page, with its meaning, other words and strokes', () => {
    const onStrokes = vi.fn();
    page({ wordId: 'word-5496-55b1-ka-li2', onStrokes });
    fireEvent.click(screen.getByRole('button', { name: 'Ver el carácter 喱, 2 de 2' }));
    const sheet = screen.getByRole('dialog');
    expect(sheet.textContent).toContain('en 咖喱: curry');
    const characterDetails = sheet.cloneNode(true) as HTMLElement;
    characterDetails.querySelector('[aria-label="Misma sílaba, otros tonos"]')?.remove();
    expect(characterDetails.textContent).not.toMatch(/HSK|Radical|Descargar/);
    expect(sheet.textContent).toContain('Palabras con');
    expect(sheet.textContent).toContain('gel');
    fireEvent.click(screen.getByRole('button', { name: /Ver trazos y escribirlo/ }));
    expect(onStrokes).toHaveBeenCalledWith('喱');
  });

  it('keeps the same label on every glyph, HSK or not', () => {
    page({ wordId: 'word-5496-55b1-ka-li2' });
    expect(within(screen.getByRole('group', { name: '咖喱' })).getAllByRole('button', { name: /^Ver el carácter / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Practicar trazos/ })).toBeNull();
  });

  it('opens a one-character Extra word on its word page from search', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    page({ onSelect, query: '喱' });
    fireEvent.click(screen.getAllByText('喱')[0]);
    expect(onSelect).toHaveBeenCalledWith('word-55b1-li2');
    expect(screen.queryByRole('dialog')).toBeNull();
    vi.useRealTimers();
  });

  it('lists characters of an Extra word inside its topic', () => {
    vocabularyStore.selectLists([EXTRA_LIST]);
    page({ topic: 'comida' });
    expect(screen.getByText('咖喱')).toBeTruthy();
    expect(screen.getByLabelText(/Carácter 咖/)).toBeTruthy();
    expect(screen.getByLabelText(/Carácter 喱/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Carácter 喱/));
    expect(screen.getByRole('dialog').textContent).toContain('en 咖喱: curry');
  });

  it('shows an Extra topic word in Temas even when Extra is not checked', () => {
    vocabularyStore.selectLists(['hsk-1']);
    expect(vocabularyStore.isSelected(EXTRA_LIST)).toBe(false);
    page({ topic: 'trabajos' });
    expect(screen.getByText('程序员')).toBeTruthy();
    expect(screen.getByLabelText(/Carácter 程/)).toBeTruthy();
  });
});
