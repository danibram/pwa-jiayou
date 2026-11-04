import { fireEvent, render, screen } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { vocabulary } from './fixtures/levelWords';
import { progressStore } from '../src/stores/progressStore';
import { discardVocabularySession, loadVocabularySession } from '../src/utils/vocabularySession';

beforeEach(() => {
  localStorage.clear();
  progressStore.clear();
  localStorage.setItem('hsk-installed-levels', '[1]');
});

describe('vocabulary browser history', () => {
  it('resumes a paused word review but never recreates a discarded review from history', () => {
    render(() => <App />);
    const home = history.state;
    fireEvent.click(screen.getByRole('button', { name: 'Aprender 10 palabras' }));
    const review = history.state;
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    const saved = loadVocabularySession(vocabulary);
    expect(saved?.position).toBe(1);

    window.dispatchEvent(new PopStateEvent('popstate', { state: home }));
    window.dispatchEvent(new PopStateEvent('popstate', { state: review }));
    // New words come in teaching order, so read the second card from the saved deck.
    expect(screen.getAllByText(saved!.deck[1].entry.simplified)[0]).toBeInTheDocument();
    expect(loadVocabularySession(vocabulary)?.position).toBe(1);

    discardVocabularySession();
    window.dispatchEvent(new PopStateEvent('popstate', { state: home }));
    window.dispatchEvent(new PopStateEvent('popstate', { state: review }));
    expect(screen.getByRole('button', { name: /^Buscar/ })).toBeInTheDocument();
    expect(loadVocabularySession(vocabulary)).toBeNull();
  });

  it('returns an expired single-word practice history entry to its word detail', () => {
    render(() => <App />);
    window.dispatchEvent(new PopStateEvent('popstate', {
      state: { jiayou: true, screen: { page: 'vocabulary-review', resume: true, practiceId: vocabulary[0].id } },
    }));
    expect(screen.getAllByText(vocabulary[0].simplified)[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprender palabra' })).toBeInTheDocument();
    expect(history.state.screen.page).toBe('vocabulario');
  });
});
