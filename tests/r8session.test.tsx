import { fireEvent, render, screen } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { progressStore } from '../src/stores/progressStore';
import VocabularyReview from '../src/pages/VocabularyReview';

vi.mock('../src/data/vocabulary', () => {
  const vocabulary = [
    { id: 'word-one', simplified: '你好', traditional: '你好', pinyin: 'nǐ hǎo', senses: [{ text: 'hola' }], level: 1, characters: ['你', '好'], topicIds: [], sourceId: 'test' },
    { id: 'word-two', simplified: '谢谢', traditional: '謝謝', pinyin: 'xièxie', senses: [{ text: 'gracias' }], level: 1, characters: ['谢'], topicIds: [], sourceId: 'test' },
  ];
  return {
    vocabularyLevels: [1, 2, 3, 4, 5, 6],
    BUNDLED_WORD_LEVEL: 1,
    catalogWords: () => vocabulary,
    levelWords: (level: number) => (level === 1 ? vocabulary : []),
    wordCount: (level: number) => (level === 1 ? vocabulary.length : 0),
    hasLevelWords: (level: number) => level === 1,
    installLevelWords: () => {},
    removeLevelWords: () => {},
    vocabularyCoverage: { edition: 'HSK 2.0', levels: [1, 2, 3, 4, 5, 6], complete: true, counts: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } },
    vocabularySources: {},
    extraVocabulary: [],
    isExtraWord: () => false,
    allWords: () => vocabulary,
    findWord: (id: string) => vocabulary.find((word) => word.id === id),
    charactersOfExtraTopicWords: () => [],
  };
});

beforeEach(() => {
  localStorage.clear();
  progressStore.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

describe('round 8 sessions', () => {
  it('keeps a missed word on screen until Continuar', () => {
    vi.useFakeTimers();
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'No lo sé' }));
    vi.advanceTimersByTime(10_000);
    expect(screen.getByText('Vuelve en unas tarjetas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByText('Vuelve en unas tarjetas')).toBeNull();
    vi.useRealTimers();
  });
});
