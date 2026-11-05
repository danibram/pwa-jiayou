import { Component, Show, createEffect, onCleanup } from 'solid-js';
import Icon from './Icon';

export type ToastType = 'default' | 'success';

interface ToastProps {
  open: boolean;
  title: string;
  description?: string;
  type?: ToastType;
  /** Auto-dismiss after this many ms. `0` keeps it until closed. */
  duration?: number;
  onClose: () => void;
}

/** Floating status card, shadcn toast layout adapted to the app tokens. */
const Toast: Component<ToastProps> = (props) => {
  createEffect(() => {
    if (!props.open) return;
    const ms = props.duration ?? 4000;
    if (ms <= 0) return;
    const timer = setTimeout(() => props.onClose(), ms);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <Show when={props.open}>
      <div
        role="status"
        aria-live="polite"
        class="pointer-events-auto fixed inset-x-4 bottom-4 z-[100] mx-auto w-auto max-w-[22rem] animate-rise sm:inset-x-auto sm:right-4 sm:left-auto"
      >
        <div class="relative flex w-full items-start gap-3 overflow-hidden rounded-tile border border-line bg-surface p-4 pr-10 shadow-card">
          <Show when={(props.type ?? 'default') === 'success'}>
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-jade text-paper" aria-hidden="true">
              <Icon name="check" size={12} />
            </span>
          </Show>
          <div class="min-w-0 flex-1 grid gap-0.5">
            <p class="text-sm font-semibold text-ink">{props.title}</p>
            <Show when={props.description}>
              <p class="text-sm text-ink-soft">{props.description}</p>
            </Show>
          </div>
          <button
            type="button"
            class="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-ink-faint hover:bg-ink/5 hover:text-ink"
            aria-label="Cerrar"
            onClick={() => props.onClose()}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>
    </Show>
  );
};

export default Toast;
