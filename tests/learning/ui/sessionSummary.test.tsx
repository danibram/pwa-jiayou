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
  open: true,
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
  it('separates answers that changed the schedule from practice', () => {
    render(() => <SessionSummary {...props()} />);

    expect(screen.getByText('2 respuestas cambiaron tu calendario y 2 fueron práctica.')).toBeTruthy();
    expect(screen.getByTestId('summary-scheduled')).toHaveTextContent('2 repasos cambiaron tu calendario');
    expect(screen.getByTestId('summary-practice')).toHaveTextContent('Práctica, sin cambiar fechas2 respuestas');
    expect(screen.getByTestId('summary-invalid')).toHaveTextContent('1');

    const rated = screen.getByRole('region', { name: 'Repasos con nota' });
    expect(within(rated).getByText('你好').closest('li')).toHaveTextContent('Bien');
    expect(within(rated).getByText('谢谢').closest('li')).toHaveTextContent('Otra vezPráctica: acierto');

    const practice = screen.getByRole('region', { name: 'Solo práctica' });
    expect(within(practice).getByText('再见').closest('li')).toHaveTextContent('Práctica: fallo');
    expect(within(practice).getByText('朋友').closest('li')).toHaveTextContent('No contó');
    expect(within(practice).queryByText('Bien')).toBeNull();

    expect(within(screen.getByRole('region', { name: 'Solo lección' })).getByText('老师')).toBeTruthy();
  });

  it('never shows a grade for a practice-only session', () => {
    const practiceOnly = items.filter((item) => item.itemId === 'word-c');
    render(() => <SessionSummary {...props({ items: practiceOnly, recorded: { 'scheduled-review': 0, practice: 1, exposure: 0, 'invalid-attempt': 0 } })} />);
    expect(screen.getByText('Ninguna respuesta cambió tu calendario y 1 fue práctica.')).toBeTruthy();
    expect(screen.queryByTestId('summary-scheduled')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Repasos con nota' })).toBeNull();
  });

  it('shows the next reviews and new words against the budget', () => {
    render(() => <SessionSummary {...props()} />);
    expect(screen.getByText('Mañana').parentElement).toHaveTextContent('3 repasos');
    expect(screen.getByText('Próximo repaso').parentElement).toHaveTextContent('mañana');
    expect(screen.getByText('Nuevas enseñadas hoy').parentElement).toHaveTextContent('7 de 20');
  });

  it('counts "Ya la sé" claims apart from lessons', () => {
    render(() => <SessionSummary {...props({ alreadyKnown: 2, recorded: { 'scheduled-review': 2, practice: 0, exposure: 3, 'invalid-attempt': 0 } })} />);
    expect(screen.getByText('Lecciones vistas').parentElement).toHaveTextContent('1');
    expect(screen.getByTestId('summary-already-known')).toHaveTextContent('Ya la sabías2 palabras');
  });

  it('reads a lesson-only session as words for tomorrow', () => {
    const taught = items.filter((item) => item.results.length === 0);
    render(() => <SessionSummary {...props({ items: taught, nextDueAt: null, recorded: { 'scheduled-review': 0, practice: 0, exposure: 1, 'invalid-attempt': 0 } })} />);
    expect(screen.getByText('Has visto 1 palabra nueva. Mañana te la pregunto.')).toBeTruthy();
    expect(screen.queryByText('Próximo repaso')).toBeNull();
  });

  it('closes from its button and renders nothing while closed', () => {
    const onClose = vi.fn();
    const { unmount } = render(() => <SessionSummary {...props({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    render(() => <SessionSummary {...props({ open: false })} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('phrases the next due time by calendar day', () => {
    expect(nextDueText(new Date(2026, 10, 5, 18, 30).getTime(), now)).toBe('hoy a las 18:30');
    expect(nextDueText(new Date(2026, 10, 6, 1, 0).getTime(), now)).toBe('mañana');
    expect(nextDueText(new Date(2026, 10, 12, 9, 0).getTime(), now)).toBe('el 12 de noviembre');
  });
});
