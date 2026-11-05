import { createSignal } from 'solid-js';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import LearningSessionShell from '../../../src/components/learning/LearningSessionShell';
import type { LearningSessionView } from '../../../src/components/learning/types';
import { meaningSelection, sessionActions, view } from './fixtures';

vi.mock('../../../src/utils/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/utils/speech')>()),
  speakWord: vi.fn(),
}));

const mount = (initial: LearningSessionView) => {
  const [current, setView] = createSignal(initial);
  const actions = sessionActions();
  render(() => (
    <LearningSessionShell view={current()} actions={actions} finished={<p>Resumen</p>}>
      <p>Tarjeta</p>
    </LearningSessionShell>
  ));
  return { actions, setView, current };
};

describe('learning session shell', () => {
  it('shows progress around the card and reports pause and undo', () => {
    const { actions } = mount(view({ selection: meaningSelection(), position: 2, total: 10, canUndo: true }));
    expect(screen.getByText('Tarjeta')).toBeTruthy();
    expect(screen.getByText('Quedan 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar la sesión' }));
    expect(actions.pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer la última respuesta' }));
    expect(actions.undoLast).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Descartar/ })).toBeNull();
  });

  it('disables undo when the controller has nothing to undo', () => {
    mount(view({ selection: meaningSelection(), position: 0 }));
    expect(screen.getByRole('button', { name: 'Deshacer la última respuesta' })).toBeDisabled();
  });

  it('says it is saving, and offers a retry when the write fails', () => {
    const { actions, setView, current } = mount(view({ selection: meaningSelection(), state: 'saving' }));
    expect(screen.getByRole('status').textContent).toBe('Guardando…');
    expect(screen.getByRole('button', { name: 'Deshacer la última respuesta' })).toBeDisabled();

    setView({ ...current(), state: 'error', error: { message: 'QuotaExceededError', retryable: true } });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No se pudo guardar el progreso en este dispositivo.');
    expect(screen.getByText('Tarjeta')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(actions.retry).toHaveBeenCalledOnce();

    setView({ ...current(), error: { message: 'Blocked', retryable: false } });
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();

    // Without advice of its own, the error reads once: the headline and what happened to the answer.
    setView({ ...current(), error: { message: '', retryable: false } });
    expect(screen.getByRole('alert').textContent).toBe(
      'No se pudo guardar el progreso en este dispositivo.Tu última respuesta no se ha guardado. Vuelve a abrir la sesión más tarde.',
    );
  });

  it('shows a storage error even before a card loads', () => {
    mount(view({ state: 'error', error: { message: 'Blocked', retryable: true } }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('pauses, resumes and hands the end to the summary', () => {
    const { actions, setView, current } = mount(view({ selection: meaningSelection(), state: 'paused' }));
    expect(screen.queryByText('Tarjeta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }));
    expect(actions.resume).toHaveBeenCalledOnce();
    setView({ ...current(), state: 'finished' });
    expect(screen.getByText('Resumen')).toBeTruthy();
  });

  it('says it is preparing while loading', () => {
    mount(view({ state: 'loading' }));
    expect(screen.getByRole('status').textContent).toContain('Preparando la sesión');
  });
});
