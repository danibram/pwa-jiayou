import { Component, createEffect, createSignal, on, onCleanup, Show } from 'solid-js';

interface SessionProgressProps {
  /** Cards answered so far, repeats included. */
  done: number;
  /** Cards still to answer, the one on screen included. A miss adds one. */
  left: number;
  /** Shown before the count, for example "Práctica libre". */
  note?: string;
}

/** Shared progress line for word and character sessions: one bar over every card, and what is left. */
const SessionProgress: Component<SessionProgressProps> = (props) => {
  /** A miss puts a card back. The count flashes so the jump up is not a mystery. */
  const [grew, setGrew] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(on(() => props.left, (left, previous) => {
    if (previous === undefined || left <= previous) return;
    setGrew(true);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => setGrew(false), 700);
  }));
  onCleanup(() => { if (timer) clearTimeout(timer); });
  return (
    <div class="flex-shrink-0">
      <div class="flex items-center justify-center gap-1.5 text-sm text-ink-soft tabular-nums">
        <Show when={props.note}>
          <span>{props.note}</span>
          <span aria-hidden="true">·</span>
        </Show>
        <span class="inline-block transition-colors duration-300" classList={{ 'animate-pop font-semibold text-seal': grew() }}>
          {props.left === 1 ? 'Queda 1' : `Quedan ${props.left}`}
        </span>
      </div>
      <div class="mx-auto mt-2 h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div
          class="h-full rounded-full bg-ink/60 transition-[width] duration-300 ease-out"
          style={{ width: `${props.done + props.left ? (props.done / (props.done + props.left)) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
};

/** Every card counts, so a miss that comes back grows what is left instead of hiding in a "+N". */
export const sessionCounts = <T,>(deck: T[], position: number) => ({
  done: Math.min(position, deck.length),
  left: Math.max(0, deck.length - position),
});

/** True when this card is the item's first graded attempt in the session. */
export const firstAttempt = <T,>(deck: T[], position: number, id: (card: T) => string, graded: (card: T) => boolean) => {
  const card = deck[position];
  if (!card) return false;
  const key = id(card);
  return !deck.slice(0, position).some((earlier) => graded(earlier) && id(earlier) === key);
};

export default SessionProgress;
