import { fireEvent, screen, waitFor } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { vocabulary } from './fixtures/levelWords';
import { renderWithStore } from './fixtures/learningStore';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('hsk-installed-levels', '[1]');
});

describe('vocabulary browser history', () => {
  it('goes back to Home and forward into the same card of a word review', async () => {
    const { store } = renderWithStore(() => <App />);
    const home = history.state;
    fireEvent.click(await screen.findByRole('button', { name: 'Aprender 10 palabras' }));
    const review = history.state;
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByText('Quedan 19')).toBeTruthy());
    const second = (await store.activeSession())!;
    const shown = second.queue[second.position].exposure!.answer.characters;

    window.dispatchEvent(new PopStateEvent('popstate', { state: home }));
    expect(await screen.findByRole('button', { name: /^Continuar sesión · Hoy/ })).toBeInTheDocument();
    window.dispatchEvent(new PopStateEvent('popstate', { state: review }));
    expect(await screen.findByText('Quedan 19')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: shown })).toBeInTheDocument();
    expect(store.events()).toHaveLength(1);
  });

  it('opens a single-word history entry as a session for that word', async () => {
    renderWithStore(() => <App />);
    await screen.findByRole('button', { name: /^Buscar/ });
    window.dispatchEvent(new PopStateEvent('popstate', {
      state: { jiayou: true, screen: { page: 'vocabulary-review', resume: true, practiceId: vocabulary[0].id } },
    }));
    expect(await screen.findByRole('img', { name: vocabulary[0].simplified })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ya la sé' })).toBeInTheDocument();
  });
});
