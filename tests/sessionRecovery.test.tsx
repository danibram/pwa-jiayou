import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Entrenamiento from '../src/pages/Entrenamiento';
import Home from '../src/pages/Home';
import { characterStore, parseCharacterList } from '../src/stores/characterStore';
import { progressStore } from '../src/stores/progressStore';
import { notifyProgressReset } from '../src/utils/progressReset';
import { discardSession, loadSession, saveSession, SessionSnapshot } from '../src/utils/sessionStore';

const chars = () => characterStore.state.characters;
beforeEach(() => {
  for (const level of [2, 3] as const) {
    if (characterStore.hasLevel(level)) continue;
    const raw = JSON.parse(readFileSync(`public/packs/hsk${level}.json`, 'utf8'));
    characterStore.installCharacters(parseCharacterList(raw, level));
  }
});
const snapshot = (): SessionSnapshot => ({
  version: 1, pool: 'today',
  selectedLevels: characterStore.state.selectedLevels.length ? [...characterStore.state.selectedLevels] : [chars()[0].hsk_level],
  deck: [{ char: chars()[0], kind: 'quiz' }, { char: chars()[1], kind: 'quiz' }],
  position: 0, revealed: false, step: 'ask', feedback: null,
  counts: { again: 0, hard: 0, good: 0 }, missed: [], seen: [], taught: [],
  heading: 'Aprender', writeState: { done: 0, total: 0, mistakes: 0, hint: false },
});
const mount = () => render(() => (
  <Entrenamiento pool="today" resume onGoHome={() => {}} onLeaveFinished={() => {}} onOpenStrokes={() => {}} />
));
afterEach(() => { vi.restoreAllMocks(); });

describe('session recovery', () => {
  it('rejects malformed or unknown saved characters', () => {
    localStorage.setItem('jiayou-session-v1', '{');
    expect(loadSession(chars())).toBeNull();
    expect(localStorage.getItem('jiayou-session-v1')).toBeNull();
    localStorage.setItem('jiayou-session-v1', JSON.stringify({
      version: 1, pool: 'today', selectedLevels: [chars()[0].hsk_level],
      deck: [{ character: 'unknown', kind: 'quiz' }],
      position: 0, revealed: false, step: 'ask', feedback: null,
      counts: { again: 0, hard: 0, good: 0 }, missed: [], seen: [], taught: [],
      heading: 'Aprender', writeState: { done: 0, total: 0, mistakes: 0, hint: false },
    }));
    expect(loadSession(chars())).toBeNull();
  });

  it('preserves sessions from a newer version', () => {
    const newer = JSON.stringify({ version: 2, futureField: true });
    localStorage.setItem('jiayou-session-v1', newer);
    expect(loadSession(chars())).toBeNull();
    expect(localStorage.getItem('jiayou-session-v1')).toBe(newer);
    expect(saveSession(snapshot())).toBe(false);
    expect(localStorage.getItem('jiayou-session-v1')).toBe(newer);
  });

  it('focuses and closes the paused session choice dialog with Escape', async () => {
    expect(saveSession(snapshot())).toBe(true);
    expect(loadSession(chars())).not.toBeNull();
    render(() => <Home onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Empezar|Aprender|Empezar repaso/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Tienes una sesión pausada' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Continuar sesión' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the card place and the checked levels when an older session has no levels', async () => {
    characterStore.selectLevels([1, 2, 3]);
    characterStore.setCurrentIndex(5);
    const raw = snapshot();
    localStorage.setItem('jiayou-session-v1', JSON.stringify({
      version: raw.version,
      pool: raw.pool,
      deck: raw.deck.map(({ char, kind }) => ({ character: char.character, kind })),
      position: raw.position,
      revealed: raw.revealed,
      step: raw.step,
      feedback: raw.feedback,
      counts: raw.counts,
      missed: [],
      seen: [],
      taught: [],
      heading: raw.heading,
      writeState: raw.writeState,
    }));
    const view = mount();
    expect(await screen.findByText('Recuerda el carácter antes de comprobar')).toBeInTheDocument();
    expect(characterStore.state.selectedLevels).toEqual([1, 2, 3]);
    expect(characterStore.state.currentIndex).toBe(5);
    expect(JSON.parse(localStorage.getItem('hsk-flashcards-progress') ?? '{}').currentIndex).toBe(5);
    view.unmount();
  });

  it('restores the covered recall step after a reload', async () => {
    saveSession(snapshot());
    const originalLevels = snapshot().selectedLevels;
    if (!originalLevels) throw new Error('La sesión de prueba no trae niveles.');
    characterStore.selectLevel(originalLevels[0] === 1 ? 2 : 1);
    const first = mount();
    expect(characterStore.state.selectedLevels).toEqual(originalLevels);
    expect(await screen.findByText('Recuerda el carácter antes de comprobar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    await waitFor(() => expect(loadSession(chars())?.step).toBe('check'));
    first.unmount();
    const second = mount();
    expect(await screen.findByRole('button', { name: 'Lo recordé' })).toBeInTheDocument();
    second.unmount();
  });

  it('records a grade once when reloaded during feedback', async () => {
    progressStore.introduce(chars()[0].character);
    const grade = vi.spyOn(progressStore, 'grade');
    saveSession({ ...snapshot(), revealed: true, step: 'learn' });
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Bien' }));
    expect(grade).toHaveBeenCalledTimes(1);
    expect(loadSession(chars())?.feedback).toBe('good');
    first.unmount();
    const second = mount();
    await waitFor(() => expect(loadSession(chars())?.position).toBe(1));
    expect(grade).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('advances past saved feedback without recording another grade', async () => {
    const grade = vi.spyOn(progressStore, 'grade');
    saveSession({ ...snapshot(), revealed: true, feedback: 'good', counts: { again: 0, hard: 0, good: 1 } });
    const view = mount();
    await waitFor(() => expect(loadSession(chars())?.position).toBe(1));
    expect(grade).not.toHaveBeenCalled();
    view.unmount();
  });

  it('resumes a new character at the ask step and introduces it once', async () => {
    const char = chars().find((item) => progressStore.isNew(item.character));
    if (!char) throw new Error('No hay un carácter nuevo.');
    saveSession({ ...snapshot(), deck: [{ char, kind: 'quiz' }], step: 'ask' });
    const introduce = vi.spyOn(progressStore, 'introduce');
    const view = mount();
    expect(await screen.findByText('Recuerda el carácter antes de comprobar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lo recordé' }));
    expect(introduce).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('keeps the session when pausing and removes it when discarding', async () => {
    saveSession(snapshot());
    const view = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Volver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar y salir' }));
    expect(loadSession(chars())).not.toBeNull();
    view.unmount();

    const second = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Volver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salir y descartar sesión' }));
    expect(loadSession(chars())).toBeNull();
    second.unmount();
  });

  it('ignores keyboard grading while an input has focus', async () => {
    progressStore.introduce(chars()[0].character);
    const grade = vi.spyOn(progressStore, 'grade');
    saveSession({ ...snapshot(), revealed: true });
    const view = mount();
    await screen.findByRole('button', { name: 'Bien' });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: '1' });
    expect(grade).not.toHaveBeenCalled();
    input.remove();
    view.unmount();
  });

  it('leaves the completed summary without opening the pause prompt', async () => {
    progressStore.introduce(chars()[0].character);
    saveSession({ ...snapshot(), deck: [{ char: chars()[0], kind: 'quiz' }] });
    const onLeaveFinished = vi.fn();
    const view = render(() => <Entrenamiento pool="today" resume onGoHome={() => {}} onLeaveFinished={onLeaveFinished} onOpenStrokes={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bien' }));
    await screen.findByRole('dialog', { name: /太棒了/ });
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(onLeaveFinished).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('¿Sales del repaso?')).not.toBeInTheDocument();
    view.unmount();
  });

  it('does not recreate a session after progress replacement during feedback', async () => {
    progressStore.introduce(chars()[0].character);
    saveSession({ ...snapshot(), revealed: true });
    const onLeaveFinished = vi.fn();
    const view = render(() => <Entrenamiento pool="today" resume onGoHome={() => {}} onLeaveFinished={onLeaveFinished} onOpenStrokes={() => {}} />);
    await screen.findByRole('button', { name: 'Bien' });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Bien' }));
    expect(loadSession(chars())?.feedback).toBe('good');
    expect(discardSession()).toBe(true);
    notifyProgressReset();
    expect(onLeaveFinished).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(loadSession(chars())).toBeNull();
    view.unmount();
    vi.useRealTimers();
  });
});
