import { Component, createSignal, onCleanup, Show } from 'solid-js';
import type { StudyStatus } from './TopicProgress';

export type SealState = StudyStatus | 'due';

/**
 * The word's state as a chop in the card's corner, one character each. Red asks for action
 * (learn it, review it today); gold and jade are the app's colours for learning and mastered.
 */
const SEAL: Record<SealState, { glyph: string; label: string; detail: string; class: string }> = {
  new: { glyph: '新', label: 'Nueva', detail: 'Aún no la has estudiado.', class: 'bg-seal text-white' },
  due: { glyph: '复', label: 'Para repasar hoy', detail: 'Toca repasarla hoy.', class: 'bg-seal text-white' },
  learning: { glyph: '学', label: 'Aprendiendo', detail: 'La estás aprendiendo.', class: 'border-2 border-gold text-gold' },
  mastered: { glyph: '熟', label: 'Dominada', detail: 'La recuerdas con soltura.', class: 'bg-jade text-white' },
};

/** Tap shows what the chop means; it hides again by itself. */
const StatusSeal: Component<{ state: SealState }> = (props) => {
  const [open, setOpen] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const toggle = () => {
    clearTimeout(timer);
    const next = !open();
    setOpen(next);
    if (next) timer = setTimeout(() => setOpen(false), 2600);
  };
  onCleanup(() => clearTimeout(timer));
  const seal = () => SEAL[props.state];
  return (
    <span class="relative inline-flex">
      <button
        type="button"
        class={`flex h-10 w-10 -rotate-6 items-center justify-center rounded-[0.5rem_0.375rem_0.625rem_0.4rem] font-hanzi text-[1.375rem] leading-none shadow-[inset_0_0_0_1px_rgb(255_255_255/0.15)] transition-transform active:scale-95 ${seal().class}`}
        aria-label={`${seal().label}. ${seal().detail}`}
        aria-expanded={open()}
        title={seal().label}
        onClick={toggle}
      >
        <span lang="zh-CN" aria-hidden="true">{seal().glyph}</span>
      </button>
      <Show when={open()}>
        <span role="status" class="absolute left-0 top-full z-10 mt-2 w-max max-w-[12rem] rounded-tile bg-ink px-2.5 py-1.5 text-left text-xs leading-snug text-paper shadow-lift">
          <span class="block font-medium">{seal().label}</span>
          <span class="block opacity-80">{seal().detail}</span>
        </span>
      </Show>
    </span>
  );
};

export default StatusSeal;
