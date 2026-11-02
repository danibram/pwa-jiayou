import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '../src/pages/Home';
import App from '../src/App';
import * as sessions from '../src/utils/vocabularySession';

vi.mock('../src/components/StrokeCanvas', () => ({ default: () => null }));
vi.mock('../src/utils/strokeData', () => ({ loadStrokeData: async () => null }));

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('vocabulary home', () => {
  it('asks before discarding an unsupported session and reports deletion failure', () => {
    const raw = JSON.stringify({ version: 99 });
    localStorage.setItem('jiayou-vocabulary-session-v1', raw);
    render(() => <Home onNavigate={() => {}} />);
    expect(screen.queryByRole('button', { name: /Aprender \d+ palabras/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar sesión guardada' }));
    expect(localStorage.getItem('jiayou-vocabulary-session-v1')).toBe(raw);
    const remove = vi.spyOn(sessions, 'discardVocabularySession').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar sesión' }));
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo borrar la sesión.');
    expect(localStorage.getItem('jiayou-vocabulary-session-v1')).toBe(raw);
    remove.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar sesión' }));
    expect(localStorage.getItem('jiayou-vocabulary-session-v1')).toBeNull();
    expect(screen.getByRole('button', { name: /Aprender \d+ palabras/ })).toBeTruthy();
  });

  it('lets the user select vocabulary levels like characters', () => {
    localStorage.setItem('hsk-installed-levels', JSON.stringify([1]));
    render(() => <Home onNavigate={() => {}} />);
    const level1 = screen.getByRole('checkbox', { name: /HSK 1,/ });
    const level2 = screen.getByRole('checkbox', { name: /HSK 2,/ });
    expect(level1).toHaveAttribute('aria-checked', 'true');
    expect(level2).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(level2);
    expect(level2).toHaveAttribute('aria-checked', 'true');
    expect(JSON.parse(localStorage.getItem('jiayou-study-lists')!).selectedLists).toEqual(['hsk-1', 'hsk-2']);
    expect(screen.getByText(/De HSK 1 y 2/)).toBeTruthy();
  });

  it('opens one topic with a tap and returns to it after viewing a word', () => {
    localStorage.setItem('hsk-installed-levels', JSON.stringify([1]));
    render(() => <App />);
    fireEvent.click(screen.getByRole('button', { name: /^Temas/ }));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^Familia,/ }));
    expect(screen.getByText('Familia', { selector: 'header div' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Estudiar \d+ nuevas?/ })).toBeTruthy();
    fireEvent.click(screen.getByText('爸爸'));
    expect(screen.getByText('HSK 1')).toBeTruthy();
    expect(screen.getByText('nueva')).toBeTruthy();
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
    expect(screen.getByText('Temas', { selector: 'header div' })).toBeTruthy();
    expect(localStorage.getItem('jiayou-topics')).toBeNull();
  });
});
