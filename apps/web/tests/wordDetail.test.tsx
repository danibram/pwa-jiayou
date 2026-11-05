import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { describe, expect, it, vi, afterEach } from 'vitest';
import WordRelations from '../src/components/WordRelations';
import CharacterDetailSheet from '../src/components/CharacterDetailSheet';
import { allWords, findWord, type VocabularyEntry } from '../src/data/vocabulary';
import { vocabulary } from './fixtures/levelWords';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { characterRecord } from '../src/utils/characterSearch';
import { familyByChar, linkedIds, markWord, wordSoundAlikes } from '../src/utils/wordDetail';
import { groupSenses, leadSense } from '@jiayou/content';
import Vocabulario from '../src/pages/Vocabulario';

const word = (simplified: string) => vocabulary.find((entry) => entry.simplified === simplified)!;
const withRelations = (simplified: string, relations: VocabularyEntry['relations']): VocabularyEntry => ({ ...word(simplified), relations });

describe('word detail helpers', () => {
  it('marks every occurrence of the word in its sentence', () => {
    expect(markWord('好好学习', '好')).toEqual([{ text: '好', hit: true }, { text: '好', hit: true }, { text: '学习', hit: false }]);
  });

  it('groups the family by character and skips the erhua suffix', () => {
    const blocks = familyByChar(word('儿子'), vocabulary);
    expect(blocks.map((block) => block.char)).toEqual(['儿', '子']);
    expect(blocks[0].words.some((other) => other.simplified === '哪儿')).toBe(false);
    expect(blocks.every((block) => block.words.length <= 4)).toBe(true);
  });

  it('lists editor confusions first and does not repeat them', () => {
    const buy = withRelations('买', [{ kind: 'confused', id: word('卖').id }]);
    const items = wordSoundAlikes(buy, allWords(), findWord);
    expect(items[0]).toMatchObject({ match: 'confused' });
    expect(items[0].word.simplified).toBe('卖');
    expect(items.filter((item) => item.word.simplified === '卖')).toHaveLength(1);
  });
});

describe('palabras cercanas', () => {
  it('draws an antonym as a pair and a classifier as the phrase', () => {
    const open = vi.fn();
    render(() => <WordRelations word={withRelations('书', [{ kind: 'classifier', id: word('本').id }])} onOpenWord={open} />);
    const classifier = screen.getByRole('group', { name: 'Se cuenta con' });
    const button = within(classifier).getByRole('button');
    expect(button.getAttribute('aria-label')).toContain('一本书');
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith(word('本').id);
  });

  it('shows the opposite next to the word itself', () => {
    render(() => <WordRelations word={withRelations('大', [{ kind: 'antonym', id: word('小').id }])} onOpenWord={() => {}} />);
    const pair = within(screen.getByRole('group', { name: 'Antónimos' })).getByRole('button');
    expect(pair.textContent).toContain('大');
    expect(pair.textContent).toContain('↔');
    expect(pair.textContent).toContain('小');
  });

  it('leaves confusions out: they belong to Suena parecido', () => {
    render(() => <WordRelations word={withRelations('买', [{ kind: 'confused', id: word('卖').id }])} onOpenWord={() => {}} />);
    expect(screen.queryByRole('region', { name: 'Palabras cercanas' })).toBeNull();
  });
});

describe('character drawer', () => {
  it('shows the radical with other characters that carry it', () => {
    const open = vi.fn();
    const record = characterRecord('妈', [])!;
    render(() => <CharacterDetailSheet character={record} installed={false} onOpenCharacter={open} onClose={() => {}} />);
    const card = screen.getByRole('region', { name: 'Radical' });
    expect(card.textContent).toContain('女');
    const sister = within(card).getByRole('button', { name: /^姐,/ });
    fireEvent.click(sister);
    expect(open).toHaveBeenCalledWith('姐');
  });
});

describe('one appearance per page', () => {
  it('keeps related and sound-alike words out of the family', () => {
    const book = { ...word('书'), relations: [{ kind: 'related' as const, id: word('图书馆').id }] };
    const shown = linkedIds(book, findWord, allWords());
    const family = familyByChar(book, vocabulary, 4, shown);
    expect(family[0].words.some((other) => other.simplified === '图书馆')).toBe(false);
    expect(family[0].words).toHaveLength(4);
  });
});

describe('significados', () => {
  afterEach(() => vocabularyStore.reset());

  it('groups uses by part of speech and opens a new group when one comes back', () => {
    expect(groupSenses([
      { pos: 'verbo', text: 'conectar' },
      { pos: 'verbo', text: 'unir' },
      { pos: 'preposición', text: 'incluso', note: 'usado con 都' },
      { pos: 'verbo', text: 'enlazar' },
    ]).map((group) => [group.pos, group.senses.length])).toEqual([['verbo', 2], ['preposición', 1], ['verbo', 1]]);
    expect(leadSense([{ pos: 'adverbio', text: 'bastante', note: 'coloquial' }])).toBe('bastante');
  });

  it('lists every use under the card, grouped by part of speech, with its note', () => {
    const entry = vocabulary.find((row) => row.senses[0].pos === 'verbo' && row.senses.some((sense) => sense.pos === 'sustantivo') && row.senses.some((sense) => sense.note))!;
    vocabularyStore.selectLists([`hsk-${entry.level}`]);
    render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} wordId={entry.id} onSelect={() => {}} onPractice={() => {}} browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }} onBrowse={() => {}} />);
    const uses = screen.getByRole('region', { name: 'Significados' });
    expect(within(uses).getByRole('group', { name: 'Verbo' })).toBeTruthy();
    expect(within(uses).getByRole('group', { name: 'Sustantivo' })).toBeTruthy();
    const noted = entry.senses.find((sense) => sense.note)!;
    expect(uses.textContent).toContain(noted.note);
  });

  it('marks a new word with a seal that explains itself', () => {
    const entry = vocabulary.find((row) => row.simplified === '书')!;
    render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} wordId={entry.id} onSelect={() => {}} onPractice={() => {}} browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }} onBrowse={() => {}} />);
    const seal = screen.getByRole('button', { name: /^Nueva\./ });
    expect(seal.textContent).toBe('新');
    fireEvent.click(seal);
    expect(screen.getByRole('status').textContent).toContain('Aún no la has estudiado');
  });
});
