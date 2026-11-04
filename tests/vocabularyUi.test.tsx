import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { sensesText } from '../src/data/wordSenses';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Vocabulario from '../src/pages/Vocabulario';
import VocabularyReview from '../src/pages/VocabularyReview';
import { vocabulary } from './fixtures/levelWords';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { loadVocabularySession } from '../src/utils/vocabularySession';

vi.mock('../src/utils/levelPacks', async (original) => ({ ...(await original<object>()), saveStudyMedia: async () => [] }));

afterEach(() => {
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
    search(sensesText(word.senses));
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

  it('shows a tappable sentence on a one-character word without repeating the character', () => {
    const word = vocabulary.find((entry) => entry.simplified === '喝')!;
    render(() => <Vocabulario onBack={() => {}} onStrokes={() => {}} wordId={word.id} onSelect={() => {}} onPractice={() => {}} browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }} onBrowse={() => {}} />);
    const sentence = screen.getByRole('region', { name: 'En una frase' });
    expect(sentence.textContent).toContain('我想喝水。');
    expect(sentence.querySelector('mark')?.textContent).toBe('喝');
    // The mark is drawn on the buttons themselves: an underline on <mark> does not reach inline-block children.
    expect(within(sentence).getByRole('button', { name: '喝 en la frase' }).className).toContain('border-b-2');
    expect(within(sentence).getByText('Quiero beber agua.')).toBeTruthy();
    // A one-character word is its own hero: the row below shows its radical and strokes instead of repeating it.
    expect(screen.queryByRole('button', { name: /^Ver el carácter 喝, [a-zà-ü]/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Ver el carácter 喝: radical 口 y trazos$/ })).toBeTruthy();
    // Any character of the sentence opens its drawer.
    fireEvent.click(within(sentence).getByRole('button', { name: '水 en la frase' }));
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
});
