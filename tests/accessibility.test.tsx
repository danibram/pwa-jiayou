import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it, vi } from 'vitest';
import ScoreModal from '../src/components/ScoreModal';
import Tarjetas from '../src/pages/Tarjetas';
import { characterStore } from '../src/stores/characterStore';
import { HSKCharacter } from '../src/types';

const summary = { again: 1, hard: 0, good: 1, total: 2, percentage: 50, streak: 0 };

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
    const missed = ['你', '好'].map((character) => ({
      character, traditional: character, pinyin: 'hǎo', definition: '', radical: '',
      stroke_count: 1, hsk_level: 1, general_standard: 0, frequency_rank: 0,
    })) satisfies HSKCharacter[];
    const dispose = render(() => {
      const [open, setOpen] = createSignal(false);
      return <>
        <button onClick={() => setOpen(true)}>Reopen</button>
        <ScoreModal summary={open() ? summary : null} missed={missed} practised={[]} onReviewMissed={() => {}} onOpenStrokes={() => {}} onGoHome={() => { onGoHome(); setOpen(false); }} />
      </>;
    }, host);
    const trigger = host.querySelector('button')!;
    trigger.focus();
    trigger.click();
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    const dialog = host.querySelector('[role="dialog"]')!;
    const buttons = dialog.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(2);
    expect(buttons[0]).toHaveFocus();
    expect(background).toHaveAttribute('inert');
    buttons[buttons.length - 1].focus();
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

  it('does not let Tarjetas page shortcuts run from focused buttons', () => {
    characterStore.selectLevel(1);
    const onOpenStrokes = vi.fn();
    const tarjetaHost = document.createElement('div');
    document.body.append(tarjetaHost);
    const dispose = render(() => <Tarjetas onGoHome={() => {}} onOpenStrokes={onOpenStrokes} />, tarjetaHost);
    const buttons = Array.from(tarjetaHost.querySelectorAll('button'));
    const next = buttons.find((button) => button.getAttribute('aria-label') === 'Siguiente')!;
    const write = buttons.find((button) => button.getAttribute('aria-label') === 'Escribir')!;
    const before = characterStore.state.currentIndex;

    next.focus();
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(characterStore.state.currentIndex).toBe(before);
    write.focus();
    write.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(tarjetaHost.textContent).toContain('¿Qué significa?');
    expect(characterStore.state.currentIndex).toBe(before);
    expect(onOpenStrokes).not.toHaveBeenCalled();

    dispose();
    tarjetaHost.remove();
    characterStore.selectLevels([]);
  });
});
