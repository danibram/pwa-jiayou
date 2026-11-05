import { screen } from '@solidjs/testing-library';
import { renderWithStore } from './fixtures/learningStore';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { vocabulary } from './fixtures/levelWords';

beforeEach(() => {
  localStorage.setItem('hsk-installed-levels', '[1]');
});

describe('screen from the url', () => {
  it('opens a shared word link on that word', async () => {
    const word = vocabulary[0];
    history.replaceState(null, '', `/palabras/${word.id}`);
    renderWithStore(() => <App />);
    expect((await screen.findAllByText(word.simplified))[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprender palabra' })).toBeInTheDocument();
    expect(history.state.screen).toEqual({ page: 'vocabulario', wordId: word.id });
    expect(location.pathname).toBe(`/palabras/${word.id}`);
  });

  it('falls back to Home and fixes the url when the path is unknown', () => {
    history.replaceState(null, '', '/no-existe');
    renderWithStore(() => <App />);
    expect(history.state.screen).toEqual({ page: 'home' });
    expect(location.pathname).toBe('/');
  });

  it('opens a review link as a session for that word, planned afresh when none is stored', async () => {
    const word = vocabulary[0];
    history.replaceState(null, '', `/repaso/${word.id}`);
    renderWithStore(() => <App />);
    expect(history.state.screen).toEqual({ page: 'vocabulary-review', resume: true, practiceId: word.id });
    expect(location.pathname).toBe(`/repaso/${word.id}`);
    // A new word starts with its lesson.
    expect(await screen.findByRole('button', { name: 'Ya la sé' })).toBeInTheDocument();
  });

  it('keeps the saved screen on reload, including where to go back', () => {
    const word = vocabulary[0];
    const saved = { page: 'vocabulario', topic: false, wordId: word.id, returnTo: 'home' };
    history.replaceState({ jiayou: true, screen: saved }, '', `/palabras/${word.id}`);
    renderWithStore(() => <App />);
    expect(history.state.screen).toEqual(saved);
  });

  it('writes the url as the user moves', async () => {
    renderWithStore(() => <App />);
    (await screen.findByRole('button', { name: 'Aprender 10 palabras' })).click();
    expect(location.pathname).toBe('/repaso');
  });
});
