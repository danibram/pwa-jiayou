import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Entrenamiento from '../src/pages/Entrenamiento';
import { characterStore } from '../src/stores/characterStore';
import { progressStore } from '../src/stores/progressStore';
import { loadSession, saveSession, SessionSnapshot } from '../src/utils/sessionStore';

const chars = characterStore.state.characters;
const snapshot = (): SessionSnapshot => ({
  version: 1, pool: 'today',
  deck: [{ character: chars[0].character, kind: 'quiz' }, { character: chars[1].character, kind: 'quiz' }],
  position: 0, revealed: false, step: 'ask', feedback: null,
  counts: { again: 0, hard: 0, good: 0 }, missed: [], seen: [], taught: [],
  heading: 'Aprender', writeState: { done: 0, total: 0, mistakes: 0, hint: false },
});
const mount = () => render(() => <Entrenamiento pool="today" resume onGoHome={() => {}} onOpenStrokes={() => {}} />);
afterEach(() => { vi.restoreAllMocks(); });

describe('session recovery', () => {
  it('rejects malformed or unknown saved characters', () => {
    localStorage.setItem('jiayou-session-v1', '{');
    expect(loadSession(chars)).toBeNull();
    expect(localStorage.getItem('jiayou-session-v1')).toBeNull();
    saveSession({ ...snapshot(), deck: [{ character: 'unknown', kind: 'quiz' }] });
    expect(loadSession(chars)).toBeNull();
  });

  it('restores the covered recall step after a reload', async () => {
    saveSession(snapshot());
    const first = mount();
    expect(await screen.findByText('Recuerda el carácter antes de comprobar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    await waitFor(() => expect(loadSession(chars)?.step).toBe('check'));
    first.unmount();
    const second = mount();
    expect(await screen.findByRole('button', { name: 'Lo recordé' })).toBeInTheDocument();
    second.unmount();
  });

  it('records a grade once when reloaded during feedback', async () => {
    progressStore.introduce(chars[0].character);
    const grade = vi.spyOn(progressStore, 'grade');
    saveSession({ ...snapshot(), revealed: true, step: 'learn' });
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Bien' }));
    expect(grade).toHaveBeenCalledTimes(1);
    expect(loadSession(chars)?.feedback).toBe('good');
    first.unmount();
    const second = mount();
    await waitFor(() => expect(loadSession(chars)?.position).toBe(1));
    expect(grade).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('advances past saved feedback without recording another grade', async () => {
    const grade = vi.spyOn(progressStore, 'grade');
    saveSession({ ...snapshot(), revealed: true, feedback: 'good', counts: { again: 0, hard: 0, good: 1 } });
    const view = mount();
    await waitFor(() => expect(loadSession(chars)?.position).toBe(1));
    expect(grade).not.toHaveBeenCalled();
    view.unmount();
  });
});
