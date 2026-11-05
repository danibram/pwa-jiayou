import { render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import Vocabulario from '../src/pages/Vocabulario';
import CharacterDetailSheet from '../src/components/CharacterDetailSheet';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { characterOrWordStub } from '../src/utils/wordCharacter';
import { vocabulary } from './fixtures/levelWords';

// Every level is on the device here, as if all had been downloaded once: what the learner sees
// still comes from the lists checked on Home.

const word = (simplified: string) => vocabulary.find((entry) => entry.simplified === simplified)!;

const page = (browse: { query?: string; topic?: string; wordId?: string }) =>
  render(() => (
    <Vocabulario
      onBack={() => {}}
      onStrokes={() => {}}
      wordId={browse.wordId}
      onSelect={() => {}}
      onPractice={() => {}}
      browse={{ query: browse.query ?? '', topic: browse.topic ?? '', scroll: 0, choosingTopic: false }}
      onBrowse={() => {}}
    />
  ));

afterEach(() => vocabularyStore.reset());

describe('only the active lists', () => {
  it('searches the checked lists, and says which ones', () => {
    expect(word('爱戴').level).toBe(6);
    vocabularyStore.selectLists(['hsk-1']);
    const view = page({ query: '爱戴' });
    expect(screen.queryByText('爱戴')).toBeNull();
    expect(screen.getByText(/en HSK 1$/)).toBeTruthy();
    view.unmount();

    vocabularyStore.selectLists(['hsk-1', 'hsk-6']);
    page({ query: '爱戴' });
    expect(screen.getByText('爱戴')).toBeTruthy();
    expect(screen.getByText(/en HSK 1 y 6$/)).toBeTruthy();
  });

  it('leaves characters of other levels out of search', () => {
    vocabularyStore.selectLists(['hsk-1']);
    // 戴 is an HSK 6 character and not a word of its own.
    page({ query: '戴' });
    expect(screen.queryByText('戴')).toBeNull();
  });

  it('lists only the checked levels in a topic', () => {
    vocabularyStore.selectLists(['hsk-1']);
    page({ topic: 'comida' });
    expect(screen.queryByText(word('熬').simplified)).toBeNull();
    expect(screen.getByText('米饭')).toBeTruthy();
  });

  it('does not open the page of a word whose list is off', () => {
    vocabularyStore.selectLists(['hsk-1']);
    page({ wordId: word('爱戴').id });
    expect(screen.queryByRole('region', { name: 'Significados' })).toBeNull();
  });

  it('fills the character drawer from the checked lists only', () => {
    vocabularyStore.selectLists(['hsk-1']);
    const char = characterOrWordStub('爱', [])!;
    render(() => <CharacterDetailSheet character={char} installed onClose={() => {}} onOpenWord={() => {}} />);
    const dialog = screen.getByRole('dialog');
    // 爱 is HSK 1; 爱戴 (HSK 6) and 爱情 (HSK 4) use it but are off.
    expect(dialog.textContent).toContain('爱');
    expect(dialog.textContent).not.toContain('爱戴');
    expect(dialog.textContent).not.toContain('爱情');
  });
});
