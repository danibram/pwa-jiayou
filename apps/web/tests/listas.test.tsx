import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Listas from '../src/pages/Listas';
import { vocabularyStore } from '../src/stores/vocabularyStore';

vi.mock('../src/utils/levelPacks', async (original) => ({ ...(await original<object>()), applyListChoice: async () => {} }));

afterEach(() => {
  vocabularyStore.reset();
  localStorage.clear();
});

describe('list picker', () => {
  it('offers Extra while it has no words, so a learner can opt in to later releases', () => {
    render(() => <Listas onDone={() => {}} />);
    const extra = screen.getByRole('checkbox', { name: /Extra/ });
    expect(extra).toHaveTextContent('Sin palabras todavía. Llegan con las actualizaciones.');
    fireEvent.click(extra);
    expect(screen.getByRole('button', { name: 'Empezar con HSK 1 y Extra' })).toBeEnabled();
  });

  it('does not start with only an empty Extra ticked', () => {
    const onDone = vi.fn();
    render(() => <Listas onDone={onDone} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /HSK 1/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Extra/ }));
    expect(screen.getByText('Extra aún no tiene palabras. Marca también un nivel HSK para empezar.')).toBeTruthy();
    const start = screen.getByRole('button', { name: /Empezar con/ });
    expect(start).toBeDisabled();
    fireEvent.click(start);
    expect(onDone).not.toHaveBeenCalled();
  });
});
