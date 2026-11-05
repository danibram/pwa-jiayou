import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it, vi } from 'vitest';
import SessionSummary from '../src/components/learning/summary/SessionSummary';

const recorded = { 'scheduled-review': 2, practice: 1, 'invalid-attempt': 0, exposure: 0 };
const items = [
  { itemId: 'word-meaning:a', label: '你', results: [{ recorded: 'scheduled-review' as const, outcome: 'correct' as const, rating: 'good' as const }] },
  { itemId: 'word-meaning:b', label: '好', results: [{ recorded: 'scheduled-review' as const, outcome: 'incorrect' as const, rating: 'again' as const }] },
];

describe('accessibility behavior', () => {
  it('traps modal focus, dismisses on Escape, and restores focus and inert state', async () => {
    const onGoHome = vi.fn();
    const priorInert = document.createElement('aside');
    priorInert.setAttribute('inert', '');
    document.body.append(priorInert);
    const host = document.createElement('div');
    document.body.append(host);
    const background = document.createElement('div');
    document.body.append(background);
    const dispose = render(() => {
      const [open, setOpen] = createSignal(false);
      return <>
        <button onClick={() => setOpen(true)}>Reopen</button>
        <SessionSummary open={open()} recorded={recorded} items={items} dueTomorrow={1} nextDueAt={null} newWords={{ taught: 0, budget: 20 }} onClose={() => { onGoHome(); setOpen(false); }} />
      </>;
    }, host);
    const trigger = host.querySelector('button')!;
    trigger.focus();
    trigger.click();
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    const dialog = host.querySelector('[role="dialog"]')!;
    const buttons = dialog.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0]).toHaveFocus();
    expect(background).toHaveAttribute('inert');
    // The summary has one button, so Tab and Shift+Tab both stay on it.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(buttons[0]).toHaveFocus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(buttons[buttons.length - 1]).toHaveFocus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(onGoHome).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
    expect(host).not.toHaveAttribute('inert');
    expect(background).not.toHaveAttribute('inert');
    expect(priorInert).toHaveAttribute('inert');
    dispose();
    host.remove();
    background.remove();
    priorInert.remove();
  });
});
