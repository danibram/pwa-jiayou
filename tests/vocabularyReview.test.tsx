import { fireEvent, render, screen } from '@solidjs/testing-library';
import { sensesText } from '../src/data/wordSenses';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { progressStore } from '../src/stores/progressStore';
import { vocabularyProgressStore } from '../src/stores/vocabularyProgressStore';
import { loadVocabularySession, saveVocabularySession } from '../src/utils/vocabularySession';
import VocabularyReview from '../src/pages/VocabularyReview';

vi.mock('../src/data/vocabulary', () => {
  const vocabulary = [
    { id: 'word-one', simplified: '你好', traditional: '你好', pinyin: 'nǐ hǎo', senses: [{ text: 'hola' }], level: 1, characters: ['你', '好'], topicIds: [], sourceId: 'test' },
    { id: 'word-two', simplified: '谢谢', traditional: '謝謝', pinyin: 'xièxie', senses: [{ text: 'gracias' }], level: 1, characters: ['谢'], topicIds: [], sourceId: 'test' },
  ];
  return {
    vocabulary,
    vocabularyLevels: [1, 2, 3, 4, 5, 6],
    vocabularyByLevel: { 1: vocabulary, 2: [], 3: [], 4: [], 5: [], 6: [] },
    vocabularyCoverage: { edition: 'HSK 2.0', levels: [1, 2, 3, 4, 5, 6], complete: true, counts: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } },
    vocabularySources: {},
    extraVocabulary: [],
    isExtraWord: () => false,
    allWords: () => vocabulary,
    findWord: (id: string) => vocabulary.find((word) => word.id === id),
    charactersOfExtraTopicWords: () => [],
  };
});
import { vocabulary } from '../src/data/vocabulary';

beforeEach(() => {
  localStorage.clear();
  progressStore.clear();
  // Listening cards play audio, which jsdom does not implement.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

describe('word review', () => {
  it('teaches words, asks them back from the Spanish, retries a failure, and resumes without grading twice', () => {
    vi.useFakeTimers();
    const view = render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} />);
    expect(screen.getByLabelText('你好')).toBeTruthy();
    // Every card counts: two introductions, two pick cards and two recognition cards.
    expect(screen.getByText('Quedan 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    // Seeing a word does not enrol it: only a graded answer does.
    expect(vocabularyProgressStore.isNew('word-one')).toBe(true);
    expect(screen.getByText('Quedan 5')).toBeTruthy();
    expect(screen.getByLabelText('谢谢')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    // The first recall is production: the Spanish, and the word to pick.
    expect(screen.getByText('¿Cómo se dice «hola»?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '谢谢' }));
    expect(screen.getByText('Esa no. Prueba otra vez.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'No lo sé' }));
    expect(vocabularyProgressStore.get('word-one')?.wrong).toBe(1);
    expect(vocabularyProgressStore.isDue('word-one')).toBe(true);
    expect(loadVocabularySession(vocabulary)?.feedback).toBe('again');
    view.unmount();
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume />);
    expect(screen.queryByRole('button', { name: 'No lo sé' })).toBeTruthy();
    expect(vocabularyProgressStore.get('word-one')?.wrong).toBe(1);
    expect(screen.getByText('¿Cómo se dice «gracias»?')).toBeTruthy();
    // One wrong pick, then the right one: Casi, graded without asking.
    fireEvent.click(screen.getByRole('button', { name: '你好' }));
    fireEvent.click(screen.getByRole('button', { name: '谢谢' }));
    // The day a word is taught, a Casi sets its review but leaves its ease alone.
    expect(vocabularyProgressStore.get('word-two')?.ease).toBe(2.5);
    // A pick found after a wrong one waits for Continuar.
    vi.advanceTimersByTime(3000);
    // The mix-up is named instead of a grade: what was tapped, and what the word is.
    expect(screen.getAllByRole('status').some((node) => /Tocaste 你好 .*谢谢 es «gracias»/.test(node.textContent ?? ''))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    // Then both come back as recognition. Never by ear on the day they were taught.
    expect(screen.queryByText('Escucha')).toBeNull();
    // Recognition is checked as well: the word, and its meaning to pick.
    for (let card = 0; card < 2; card++) {
      const saved = loadVocabularySession(vocabulary)!;
      const meaning = sensesText(saved.deck[saved.position].entry.senses);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${meaning}$`, 'i') }));
      vi.advanceTimersByTime(1200);
    }
    // The miss comes back the way it was asked: from the Spanish, to pick.
    expect(screen.getByText('¿Cómo se dice «hola»?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '你好' }));
    vi.advanceTimersByTime(1200);
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Both words were taught today: the summary lists them instead of grading answers given seconds after the lesson.
    expect(screen.getByText('2 palabras nuevas')).toBeTruthy();
    expect(screen.queryByText(/palabras en esta sesión/)).toBeNull();
    // The retry already rescheduled the miss, so nothing is left for today.
    expect(screen.getByText('1 palabra que fallaste y luego acertaste vuelve mañana.')).toBeTruthy();
    expect(loadVocabularySession(vocabulary)).toBeNull();
    vi.useRealTimers();
  });

  it('keeps a non-due word schedule during free practice and preserves the daily session', () => {
    vocabularyProgressStore.grade('word-one', 'good');
    const before = vocabularyProgressStore.get('word-one')!;
    const due = before.due;
    const interval = before.interval;
    localStorage.setItem('jiayou-vocabulary-session-v1', JSON.stringify({ version: 99 }));
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} practiceId="word-one" />);
    expect(screen.getByText('Práctica')).toBeTruthy();
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    fireEvent.keyDown(window, { code: 'Digit1', key: '1' });
    // A miss in free practice keeps the interval and ease, but brings the word back tomorrow at the latest.
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
    expect(vocabularyProgressStore.get('word-one')?.due).toBe(Math.min(due, tomorrow.getTime()));
    expect(vocabularyProgressStore.get('word-one')?.interval).toBe(interval);
    expect(loadVocabularySession(vocabulary, 'word-one')?.feedback).toBe('again');
    expect(localStorage.getItem('jiayou-vocabulary-session-v1')).toBe(JSON.stringify({ version: 99 }));
  });

  it('skips a saved introduction learned in a separate session', () => {
    const view = render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    view.unmount();
    vocabularyProgressStore.introduce('word-two');
    vocabularyProgressStore.grade('word-two', 'good');
    const before = vocabularyProgressStore.get('word-two')!;
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume />);
    // The second introduction is gone; the session goes on with the first word's pick card.
    expect(screen.getByText('¿Cómo se dice «hola»?')).toBeTruthy();
    expect(vocabularyProgressStore.get('word-two')).toEqual(before);
  });

  it('does not reschedule a saved recall graded in another session', () => {
    vocabularyProgressStore.introduce('word-one');
    saveVocabularySession({ version: 1, deck: [{ entry: vocabulary[0], kind: 'recall' }], position: 0, revealed: false, step: 'ask', feedback: null, counts: { again: 0, hard: 0, good: 0 }, heading: 'Repaso', mode: 'today' });
    vocabularyProgressStore.grade('word-one', 'good');
    const due = vocabularyProgressStore.get('word-one')!.due;
    const interval = vocabularyProgressStore.get('word-one')!.interval;
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bien' }));
    expect(vocabularyProgressStore.get('word-one')?.due).toBe(due);
    expect(vocabularyProgressStore.get('word-one')?.interval).toBe(interval);
  });

  it('practises the whole pilot without changing schedules or the daily session', () => {
    vocabularyProgressStore.grade('word-one', 'good');
    const before = vocabularyProgressStore.get('word-one')!;
    localStorage.setItem('jiayou-vocabulary-session-v1', JSON.stringify({ version: 99 }));
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} practiceId="__all__" />);
    expect(screen.getByText('Repasar todo')).toBeTruthy();
    // A word met once is recognised among words already met, not self-graded.
    expect(screen.getByText('¿Qué significa?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'No lo sé' }));
    // A miss in free practice keeps the interval, but brings the word back tomorrow at the latest.
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
    expect(vocabularyProgressStore.get('word-one')?.due).toBe(Math.min(before.due, tomorrow.getTime()));
    expect(vocabularyProgressStore.get('word-one')?.interval).toBe(before.interval);
    expect(localStorage.getItem('jiayou-vocabulary-session-v1')).toBe(JSON.stringify({ version: 99 }));
  });

  it('requires confirmation before deleting an unsupported practice session', () => {
    const key = 'jiayou-vocabulary-session-v1:practice:__all__';
    const raw = JSON.stringify({ version: 99 });
    localStorage.setItem(key, raw);
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} practiceId="__all__" />);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar sesión guardada' }));
    expect(localStorage.getItem(key)).toBe(raw);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar sesión' }));
    // Nothing has been learned yet, and a review never quizzes unseen words.
    expect(screen.getByText('Aún no hay palabras que repasar')).toBeTruthy();
  });

  it('schedules a due word when opened individually', () => {
    vocabularyProgressStore.grade('word-one', 'again');
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} practiceId="word-one" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bien' }));
    expect(vocabularyProgressStore.isDue('word-one')).toBe(false);
  });

  it('requeues a due word after an incorrect answer', () => {
    vocabularyProgressStore.grade('word-one', 'again');
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'No lo sé' }));
    expect(vocabularyProgressStore.get('word-one')?.wrong).toBe(2);
    expect(loadVocabularySession(vocabulary)?.deck.filter((card) => card.entry.id === 'word-one')).toHaveLength(2);
  });

  it('does not ask an answered card again after a writing excursion', () => {
    vocabularyProgressStore.grade('word-one', 'again');
    const onStrokes = vi.fn();
    const view = render(() => <VocabularyReview onBack={vi.fn()} onStrokes={onStrokes} resume={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'No lo sé' }));
    fireEvent.click(screen.getByRole('button', { name: /^Practicar trazos de 你/ }));
    expect(onStrokes).toHaveBeenCalledWith('你');
    view.unmount();
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={onStrokes} resume />);
    // A choice card is graded when answered, so the session goes on from the next card and the miss counts once.
    expect(vocabularyProgressStore.get('word-one')?.wrong).toBe(2);
    expect(screen.getByLabelText('谢谢')).toBeTruthy();
  });

  it('interleaves new words in groups of three with their recalls', () => {
    const view = render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} />);
    // Both pilot words fit in one group: two introductions, then their pick cards.
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('group', { name: 'Elige la palabra' })).toBeTruthy();
    view.unmount();
  });

  it('enrols a word the learner already knows and drops its questions', () => {
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} />);
    expect(screen.getByText('Quedan 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ya la sé' }));
    expect(vocabularyProgressStore.isNew('word-one')).toBe(false);
    expect(vocabularyProgressStore.isDue('word-one')).toBe(false);
    // Known: its pick and recognition cards leave with it, and it spends none of today's new words.
    expect(screen.getByText('Quedan 3')).toBeTruthy();
    expect(vocabularyProgressStore.daily.introduced).toBe(0);
    expect(screen.getByLabelText('谢谢')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('¿Cómo se dice «gracias»?')).toBeTruthy();
  });

  it('undoes the session answers when the learner discards it', () => {
    vi.useFakeTimers();
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: '你好' }));
    vi.advanceTimersByTime(1200);
    expect(vocabularyProgressStore.isNew('word-one')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y salir' }));
    expect(vocabularyProgressStore.isNew('word-one')).toBe(true);
    expect(vocabularyProgressStore.daily.reviewed).toBe(0);
    vi.useRealTimers();
  });

  it('undoes answers given before a pause, and keeps a change made outside the session', () => {
    vi.useFakeTimers();
    vocabularyProgressStore.grade('word-other', 'good');
    const view = render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: '你好' }));
    vi.advanceTimersByTime(1200);
    view.unmount();
    // Practice elsewhere while the session is paused.
    vocabularyProgressStore.grade('word-other', 'again');
    const outside = vocabularyProgressStore.get('word-other');
    render(() => <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} resume />);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y salir' }));
    expect(vocabularyProgressStore.isNew('word-one')).toBe(true);
    expect(vocabularyProgressStore.get('word-other')).toEqual(outside);
    vi.useRealTimers();
  });
});
