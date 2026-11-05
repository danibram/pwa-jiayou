import { render } from 'solid-js/web';
import { describe, expect, it, vi } from 'vitest';
import SessionSummary from '../src/components/learning/summary/SessionSummary';

const recorded = { 'scheduled-review': 2, practice: 1, 'invalid-attempt': 0, exposure: 0 };
const items = [
  { itemId: 'word-meaning:a', label: '你', results: [{ recorded: 'scheduled-review' as const, outcome: 'correct' as const, rating: 'good' as const }] },
  { itemId: 'word-meaning:b', label: '好', results: [{ recorded: 'scheduled-review' as const, outcome: 'incorrect' as const, rating: 'again' as const }] },
];

describe('accessibility behavior', () => {
  it('shows the session summary as a page: focus on its heading, nothing behind it made inert', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const background = document.createElement('div');
    document.body.append(background);
    const onGoHome = vi.fn();
    const dispose = render(() => (
      <SessionSummary recorded={recorded} items={items} dueTomorrow={1} nextDueAt={null} newWords={{ taught: 0, budget: 20 }} onClose={onGoHome} />
    ), host);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('#session-summary-title')).toHaveFocus();
    expect(background).not.toHaveAttribute('inert');
    // Escape does not close a page: only its button leaves.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onGoHome).not.toHaveBeenCalled();
    dispose();
    host.remove();
    background.remove();
  });
});
