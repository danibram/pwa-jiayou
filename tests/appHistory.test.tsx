import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { characterStore } from '../src/stores/characterStore';
import { loadSession } from '../src/utils/sessionStore';

describe('app browser history', () => {
  it('restores a paused training screen on Back and Forward', async () => {
    render(() => <App />);
    const homeState = history.state;
    const start = screen.getByRole('button', { name: /Empezar|Aprender|Empezar repaso/ });
    fireEvent.click(start);
    await screen.findByRole('button', { name: /Mostrar respuesta|Ahora, de memoria/ });
    const trainingState = history.state;
    const saved = loadSession(characterStore.state.characters);
    expect(saved).not.toBeNull();

    window.dispatchEvent(new PopStateEvent('popstate', { state: homeState }));
    expect(await screen.findByRole('button', { name: /Empezar|Aprender|Empezar repaso/ })).toBeInTheDocument();
    window.dispatchEvent(new PopStateEvent('popstate', { state: trainingState }));
    await screen.findByRole('button', { name: /Mostrar respuesta|Ahora, de memoria/ });
    expect(loadSession(characterStore.state.characters)?.deck).toEqual(saved?.deck);
  });

  it('leaves a finished session on the page underneath it', async () => {
    render(() => <App />);
    const homeState = history.state;
    fireEvent.click(screen.getByRole('button', { name: /Empezar|Aprender|Empezar repaso/ }));
    await screen.findByRole('button', { name: /Mostrar respuesta|Ahora, de memoria/ });
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salir y descartar sesión' }));
    await waitFor(() => expect(history.state).toEqual(homeState));
    expect(screen.getByRole('button', { name: /Empezar|Aprender|Empezar repaso/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Explorar/ }));
    await screen.findByRole('button', { name: 'Diccionario Pleco' });
    expect(history.state?.screen?.page).toBe('tarjetas');
  });

  it('keeps the cards page in history when Volver goes home', async () => {
    render(() => <App />);
    const homeState = history.state;
    fireEvent.click(screen.getByRole('button', { name: /Explorar/ }));
    await screen.findByRole('button', { name: 'Diccionario Pleco' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(await screen.findByRole('button', { name: /Empezar|Aprender|Empezar repaso/ })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(history.state?.screen?.page).toBe('home');
    expect(history.state).not.toBe(homeState);
  });
});
