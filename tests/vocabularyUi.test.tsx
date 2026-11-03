import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Vocabulario from '../src/pages/Vocabulario';
import VocabularyReview from '../src/pages/VocabularyReview';
import { vocabulary } from '../src/data/vocabulary';
import { myWordsStore } from '../src/stores/myWordsStore';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { loadVocabularySession } from '../src/utils/vocabularySession';

vi.mock('../src/utils/levelPacks', async (original) => ({ ...(await original<object>()), saveStudyMedia: async () => [] }));

afterEach(() => {
  myWordsStore.reset();
  vocabularyStore.reset();
  localStorage.clear();
});

describe('vocabulary screens', () => {
  /** Typing waits for a pause before the list filters. */
  const search = (value: string) => {
    fireEvent.input(screen.getByRole('searchbox'), { target: { value } });
    vi.advanceTimersByTime(300);
  };

  it('searches by meaning and opens a word', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const [browse, setBrowse] = createSignal({ query: '', topic: '', scroll: 0, choosingTopic: false });
    render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} onSelect={onSelect} onPractice={() => {}} browse={browse()} onBrowse={setBrowse} />);
    const word = vocabulary.find((entry) => entry.characters.length > 1)!;
    search(word.meaning);
    fireEvent.click(screen.getByText(word.simplified));
    expect(onSelect).toHaveBeenCalledWith(word.id);
    vi.useRealTimers();
  });

  it('opens a one-character word on its word page, not the character sheet', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const [browse, setBrowse] = createSignal({ query: '', topic: '', scroll: 0, choosingTopic: false });
    render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} onSelect={onSelect} onPractice={() => {}} browse={browse()} onBrowse={setBrowse} />);
    const word = vocabulary.find((entry) => entry.simplified === '水')!;
    search('水');
    fireEvent.click(screen.getAllByText('水')[0]);
    expect(onSelect).toHaveBeenCalledWith(word.id);
    expect(screen.queryByRole('dialog')).toBeNull();
    vi.useRealTimers();
  });

  it('lists each character of a word once and opens its sheet', () => {
    const word = vocabulary.find((entry) => entry.simplified === '爸爸')!;
    render(() => (
      <Vocabulario
        onBack={() => {}}
        onStrokes={() => {}}
        wordId={word.id}
        onSelect={() => {}}
        onPractice={() => {}}
        browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }}
        onBrowse={() => {}}
      />
    ));
    const rows = screen.getAllByRole('button', { name: /^Ver el carácter 爸, [a-zà-ü]/ });
    expect(rows).toHaveLength(1);
    fireEvent.click(rows[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('waits for a pause before filtering', () => {
    vi.useFakeTimers();
    const [browse, setBrowse] = createSignal({ query: '', topic: '', scroll: 0, choosingTopic: false });
    render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} onSelect={() => {}} onPractice={() => {}} browse={browse()} onBrowse={setBrowse} />);
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'xue' } });
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'xuesheng' } });
    expect(browse().query).toBe('');
    vi.advanceTimersByTime(300);
    expect(browse().query).toBe('xuesheng');
    expect(screen.getByText('学生')).toBeTruthy();
    vi.useRealTimers();
  });

  it('teaches a new word before asking and saves the session', () => {
    render(() => <VocabularyReview onBack={() => {}} onStrokes={() => {}} resume={false} />);
    expect(screen.getByText('Continuar')).toBeTruthy();
    fireEvent.click(screen.getByText('Continuar'));
    expect(loadVocabularySession(vocabulary)?.deck.some((card) => card.kind === 'recall')).toBe(true);
  });

  it('opens add-to-my-words from a word card with HSK data ready to correct', () => {
    const word = vocabulary.find((entry) => entry.simplified === '朋友')!;
    render(() => (
      <Vocabulario
        onBack={() => {}}
        onStrokes={() => {}}
        wordId={word.id}
        onSelect={() => {}}
        onPractice={() => {}}
        browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }}
        onBrowse={() => {}}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a mis palabras' }));
    expect(screen.getByText(/Ya está en HSK/)).toBeTruthy();
    expect(screen.getByLabelText('Significado')).toHaveValue('amigo; amiga');
    fireEvent.input(screen.getByLabelText('Significado'), { target: { value: 'colega' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(myWordsStore.isCorrection(word.id)).toBe(true);
    expect(myWordsStore.words()[0]?.meaning).toBe('colega');
    const corrected = screen.getByRole('button', { name: 'Corregir en mis palabras' });
    expect(corrected.className).toMatch(/text-gold/);
  });
});
