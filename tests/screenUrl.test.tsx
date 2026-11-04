import { render, screen } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { vocabulary } from '../src/data/vocabulary';
import { progressStore } from '../src/stores/progressStore';

beforeEach(() => {
  progressStore.clear();
  localStorage.setItem('hsk-installed-levels', '[1]');
});

describe('screen from the url', () => {
  it('opens a shared word link on that word', () => {
    const word = vocabulary[0];
    history.replaceState(null, '', `/palabras/${word.id}`);
    render(() => <App />);
    expect(screen.getAllByText(word.simplified)[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprender palabra' })).toBeInTheDocument();
    expect(history.state.screen).toEqual({ page: 'vocabulario', wordId: word.id });
    expect(location.pathname).toBe(`/palabras/${word.id}`);
  });

  it('falls back to Home and fixes the url when the path is unknown', () => {
    history.replaceState(null, '', '/no-existe');
    render(() => <App />);
    expect(history.state.screen).toEqual({ page: 'home' });
    expect(location.pathname).toBe('/');
  });

  it('sends a review link without a saved session to its word', () => {
    const word = vocabulary[0];
    history.replaceState(null, '', `/repaso/${word.id}`);
    render(() => <App />);
    expect(history.state.screen).toEqual({ page: 'vocabulario', wordId: word.id });
    expect(location.pathname).toBe(`/palabras/${word.id}`);
  });

  it('keeps the saved screen on reload, including where to go back', () => {
    const word = vocabulary[0];
    const saved = { page: 'vocabulario', topic: false, wordId: word.id, returnTo: 'home' };
    history.replaceState({ jiayou: true, screen: saved }, '', `/palabras/${word.id}`);
    render(() => <App />);
    expect(history.state.screen).toEqual(saved);
  });

  it('writes the url as the user moves', () => {
    render(() => <App />);
    screen.getByRole('button', { name: 'Aprender 10 palabras' }).click();
    expect(location.pathname).toBe('/repaso');
  });
});
