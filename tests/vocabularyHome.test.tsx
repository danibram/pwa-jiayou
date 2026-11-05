import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '../src/pages/Home';
import App from '../src/App';
import { renderWithStore } from './fixtures/learningStore';

vi.mock('../src/components/StrokeCanvas', () => ({ default: () => null }));
vi.mock('../src/utils/strokeData', () => ({ loadStrokeData: async () => null }));

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('vocabulary home', () => {
  it('reads today from the learning log and offers to continue a session left halfway', async () => {
    localStorage.setItem('hsk-installed-levels', JSON.stringify([1]));
    const { store } = renderWithStore(() => <App />);
    expect(await screen.findByText('Hoy: 10 nuevas.')).toBeTruthy();
    expect(screen.getByText('Esta semana aún no has practicado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aprender 10 palabras' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enséñamela' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(store.events()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    // Leaving keeps the lesson; Home counts it and offers the rest of the session.
    expect(await screen.findByRole('button', { name: /^Continuar sesión · Hoy/ })).toBeTruthy();
    expect(screen.getByText('Esta semana has practicado 1 día')).toBeTruthy();
    expect(screen.getByText('Hoy has estudiado 1 palabra, 1 nueva')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Continuar sesión · Hoy/ }));
    expect(await screen.findByText('Quedan 19')).toBeTruthy();
  });

  it('lets the user select vocabulary levels like characters', () => {
    localStorage.setItem('hsk-installed-levels', JSON.stringify([1]));
    renderWithStore(() => <Home onNavigate={() => {}} />);
    const level1 = screen.getByRole('checkbox', { name: /HSK 1,/ });
    const level2 = screen.getByRole('checkbox', { name: /HSK 2,/ });
    expect(level1).toHaveAttribute('aria-checked', 'true');
    expect(level2).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(level2);
    expect(level2).toHaveAttribute('aria-checked', 'true');
    expect(JSON.parse(localStorage.getItem('jiayou-study-lists')!).selectedLists).toEqual(['hsk-1', 'hsk-2']);
    expect(screen.getByText(/De HSK 1 y 2/)).toBeTruthy();
  });

  it('opens one topic with a tap and returns to it after viewing a word', async () => {
    localStorage.setItem('hsk-installed-levels', JSON.stringify([1]));
    renderWithStore(() => <App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Temas/ }));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // Familia is a subtopic of Personas y relaciones: the theme opens first, then its chip.
    fireEvent.click(screen.getByRole('button', { name: /^Personas y relaciones,/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Subtemas' })).getByRole('button', { name: 'Familia' }));
    expect(screen.getByText('Familia', { selector: 'header div' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Estudiar \d+ nuevas?/ })).toBeTruthy();
    fireEvent.click(screen.getByText('爸爸'));
    expect(screen.getByText('HSK 1')).toBeTruthy();
    // A new word shows no status tag: the Aprender button already says it.
    expect(screen.queryByText('nueva')).toBeNull();
    expect(screen.getByRole('button', { name: /^Escuchar$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprender palabra' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver el carácter 爸, 2 de 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver el carácter 爸, 1 de 2' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ver trazos y escribirlo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('HSK 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('Familia', { selector: 'header div' })).toBeTruthy();
    expect(screen.getByText('爸爸')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('Personas y relaciones', { selector: 'header div' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('Temas', { selector: 'header div' })).toBeTruthy();
    expect(localStorage.getItem('jiayou-topics')).toBeNull();
  });
});
