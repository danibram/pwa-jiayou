import { Component, JSX, Match, Show, Switch } from 'solid-js';
import Icon from '../Icon';
import RiceGrid from '../RiceGrid';
import SessionProgress from '../SessionProgress';
import type { LearningSessionActions, LearningSessionView } from './types';

interface LearningSessionShellProps {
  view: LearningSessionView;
  actions: LearningSessionActions;
  /** Shown over the progress line, for example "Palabra nueva" or the topic. */
  note?: string;
  /** The card, usually `<LearningCard>`. Shown while a card is on screen, saving or failing to save. */
  children: JSX.Element;
  /** What a finished session shows. The summary package fills it. */
  finished?: JSX.Element;
}

/** The write failed. A retryable error offers to try again; the answer stays on screen meanwhile. */
const StorageError: Component<{ view: LearningSessionView; actions: LearningSessionActions }> = (props) => (
  <Show when={props.view.state === 'error' && props.view.error}>{(error) => (
    <div role="alert" class="mt-1 rounded-xl bg-seal-soft/60 px-4 py-3 text-center">
      <p class="text-sm text-seal">No se pudo guardar el progreso en este dispositivo.</p>
      <Show when={error().message}><p class="mt-1 text-xs text-ink-soft">{error().message}</p></Show>
      <Show when={error().retryable} fallback={
        <p class="mt-1 text-xs text-ink-soft">Tu última respuesta no se ha guardado. Vuelve a abrir la sesión más tarde.</p>
      }>
        <button type="button" class="btn-ink mt-2 h-11 w-full" onClick={() => props.actions.retry()}>Reintentar</button>
      </Show>
    </div>
  )}</Show>
);

/**
 * The frame around a session: progress, pause, undo of the last answer, a saving indicator and the
 * storage error with its retry. Leaving keeps what was answered; there is no discard.
 */
const LearningSessionShell: Component<LearningSessionShellProps> = (props) => {
  const onCard = () => ['presenting', 'feedback', 'saving', 'error'].includes(props.view.state) && !!props.view.selection;
  const canUndo = () => props.view.canUndo && props.view.state !== 'saving';
  const left = () => Math.max(0, props.view.total - props.view.position);

  return (
    <div class="flex min-h-0 flex-1 flex-col pb-5 pt-1 animate-rise [animation-delay:60ms]">
      <Switch>
        <Match when={props.view.state === 'loading'}>
          <div class="m-auto text-center" role="status">
            <RiceGrid class="mx-auto h-16 w-16 text-ink-faint" />
            <p class="mt-3 text-sm text-ink-soft">Preparando la sesión…</p>
          </div>
        </Match>
        <Match when={props.view.state === 'paused'}>
          <div class="m-auto max-w-[18rem] text-center">
            <p class="font-display text-2xl font-semibold">Sesión en pausa</p>
            <p class="mt-2 text-sm text-ink-soft">Lo que has respondido está guardado. Sigue cuando quieras.</p>
            <button type="button" class="btn-ink mt-6 h-12 w-full px-8" onClick={() => props.actions.resume()}>Seguir</button>
          </div>
        </Match>
        <Match when={props.view.state === 'finished'}>{props.finished}</Match>
        <Match when={props.view.state === 'error' && !props.view.selection}>
          <div class="m-auto w-full max-w-[18rem]"><StorageError view={props.view} actions={props.actions} /></div>
        </Match>
        <Match when={onCard()}>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn-ghost h-11 w-11 shrink-0"
              aria-label="Pausar la sesión"
              disabled={props.view.state === 'saving'}
              onClick={() => props.actions.pause()}
            ><Icon name="pause" size={18} /></button>
            <div class="min-w-0 flex-1">
              <SessionProgress done={props.view.position} left={left()} note={props.note} />
            </div>
            <button
              type="button"
              class="btn-ghost h-11 w-11 shrink-0"
              aria-label="Deshacer la última respuesta"
              disabled={!canUndo()}
              onClick={() => props.actions.undoLast()}
            ><Icon name="replay" size={18} /></button>
          </div>
          {props.children}
          <div class="min-h-6 text-center">
            <Show when={props.view.state === 'saving'}>
              <p role="status" class="text-sm text-ink-soft">Guardando…</p>
            </Show>
          </div>
          <StorageError view={props.view} actions={props.actions} />
        </Match>
      </Switch>
    </div>
  );
};

export default LearningSessionShell;
