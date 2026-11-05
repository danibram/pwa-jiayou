import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import SessionSummary, { nextDueText, type SessionSummaryProps, type SummaryItemResult } from '../../../src/components/learning/summary/SessionSummary';

const now = new Date(2026, 10, 5, 10, 0).getTime();

const items: SummaryItemResult[] = [
  { itemId: 'word-a', label: '你好', pinyin: 'nǐ hǎo', results: [{ recorded: 'scheduled-review', outcome: 'correct', rating: 'good' }] },
  // Again, then practice four cards later: one grade, one practice answer.
  { itemId: 'word-b', label: '谢谢', results: [
    { recorded: 'scheduled-review', outcome: 'incorrect', rating: 'again' },
    { recorded: 'practice', outcome: 'correct', rating: null },
  ] },
  { itemId: 'word-c', label: '再见', results: [{ recorded: 'practice', outcome: 'incorrect', rating: null }] },
  { itemId: 'word-d', label: '朋友', results: [{ recorded: 'invalid-attempt', outcome: 'invalid', rating: null }] },
  { itemId: 'word-e', label: '老师', results: [] },
];

const props = (overrides: Partial<SessionSummaryProps> = {}): SessionSummaryProps => ({
  recorded: { 'scheduled-review': 2, practice: 2, exposure: 1, 'invalid-attempt': 1 },
  items,
  dueTomorrow: 3,
  nextDueAt: new Date(2026, 10, 6, 9, 0).getTime(),
  newWords: { taught: 7, budget: 20 },
  now,
  onClose: vi.fn(),
  ...overrides,
});

describe('session summary', () => {
  it('says what was done, then lists the words to look at again first', () => {
    render(() => <SessionSummary {...props()} />);

    expect(screen.getByText('Has visto 1 palabra nueva y has repasado 2.')).toBeTruthy();
    expect(screen.getByTestId('summary-scheduled')).toHaveTextContent('2 repasos cambiaron tu calendario');
    expect(screen.getByTestId('summary-practice')).toHaveTextContent('La práctica no cambia cuándo vuelven tus repasos.');
    expect(screen.getByTestId('summary-invalid')).toHaveTextContent('1 respuesta no contó');

    // One chip per word: a miss counts, whatever else happened.
    const review = screen.getByRole('region', { name: 'Para repasar' });
    expect(within(review).getByText('谢谢').closest('li')).toHaveTextContent('1 fallo');
    expect(within(review).getByText('再见').closest('li')).toHaveTextContent('1 fallo');

    const good = screen.getByRole('region', { name: 'Bien' });
    expect(within(good).getByText('你好').closest('li')).toHaveTextContent('Bien');
    expect(within(good).getByText('朋友').closest('li')).toHaveTextContent('No contó');

    expect(within(screen.getByRole('region', { name: 'Vistas por primera vez' })).getByText('老师')).toBeTruthy();
  });

  it('shows no rating bar for a practice-only session', () => {
    const practiceOnly = [{ itemId: 'word-f', label: '谢谢', results: [{ recorded: 'practice' as const, outcome: 'correct' as const, rating: null }] }];
    render(() => <SessionSummary {...props({ items: practiceOnly, recorded: { 'scheduled-review': 0, practice: 1, exposure: 0, 'invalid-attempt': 0 } })} />);
    expect(screen.getByText('Has practicado 1 palabra.')).toBeTruthy();
    expect(screen.queryByTestId('summary-scheduled')).toBeNull();
    expect(screen.getByText('谢谢').closest('li')).toHaveTextContent('Bien');
    expect(screen.getByText('谢谢').closest('li')).not.toHaveTextContent('fallo');
  });

  it('shows tomorrow and new words against the budget, and a review due later today', () => {
    const { unmount } = render(() => <SessionSummary {...props()} />);
    expect(screen.getByTestId('summary-tomorrow')).toHaveTextContent('3 repasos');
    expect(screen.getByTestId('summary-new')).toHaveTextContent('7 de 20');
    // Tomorrow's first review is already in the count.
    expect(screen.queryByTestId('summary-next')).toBeNull();
    unmount();
    render(() => <SessionSummary {...props({ nextDueAt: new Date(2026, 10, 5, 18, 30).getTime() })} />);
    expect(screen.getByTestId('summary-next')).toHaveTextContent('Próximo repaso hoy a las 18:30');
  });

  it('counts "Ya la sé" claims apart from lessons', () => {
    render(() => <SessionSummary {...props({ alreadyKnown: 2, recorded: { 'scheduled-review': 2, practice: 0, exposure: 3, 'invalid-attempt': 0 } })} />);
    expect(screen.getByText('Has visto 1 palabra nueva y has repasado 2.')).toBeTruthy();
    expect(screen.getByTestId('summary-already-known')).toHaveTextContent('Ya sabías 2 palabras');
  });

  it('reads a lesson-only session as words for tomorrow', () => {
    const taught = items.filter((item) => item.results.length === 0);
    render(() => <SessionSummary {...props({ items: taught, nextDueAt: null, recorded: { 'scheduled-review': 0, practice: 0, exposure: 1, 'invalid-attempt': 0 } })} />);
    expect(screen.getByText('Has visto 1 palabra nueva. Mañana te la pregunto.')).toBeTruthy();
    expect(screen.queryByTestId('summary-next')).toBeNull();
  });

  it('leaves from its button', () => {
    const onClose = vi.fn();
    render(() => <SessionSummary {...props({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens a word of the session from its row', () => {
    const onOpenItem = vi.fn();
    render(() => <SessionSummary {...props({ onOpenItem })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver 你好' }));
    expect(onOpenItem).toHaveBeenCalledWith('word-a');
  });

  it('phrases the next due time by calendar day', () => {
    expect(nextDueText(new Date(2026, 10, 5, 18, 30).getTime(), now)).toBe('hoy a las 18:30');
    expect(nextDueText(new Date(2026, 10, 6, 1, 0).getTime(), now)).toBe('mañana');
    expect(nextDueText(new Date(2026, 10, 12, 9, 0).getTime(), now)).toBe('el 12 de noviembre');
  });
});
