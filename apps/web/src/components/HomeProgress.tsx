import { Component, createSignal, onMount, Show } from 'solid-js';
import { nextReviewsLabel, type ProgressSummary } from '../utils/progressSummary';
import Icon from './Icon';

/** What Home showed last time, so a return can say what changed. */
export interface ProgressSnapshot {
  mastered: number;
  learning: number;
}

interface HomeProgressProps {
  summary: ProgressSummary;
  /** Feminine for "palabras", masculine for "caracteres". */
  feminine: boolean;
  /** Starts a session with the weak items. */
  onWeak: () => void;
  /** The counts Home showed on the previous visit. The bar grows from them and the gains are named once. */
  previous?: ProgressSnapshot | null;
  /** Starts the session that writes characters already known from words. */
  onKnown?: () => void;
  /** Unseen characters known from words, outside the daily cap. Defaults to the summary's count. */
  knownCount?: number;
  /** Today so far: how many items were studied and how many of them were new. It only grows during the day. */
  today?: { studied: number; fresh: number; noun: [string, string] };
}

const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);

/** Three-segment bar: dominadas, aprendiendo, nuevas. Learning shows up after the first session. */
const HomeProgress: Component<HomeProgressProps> = (props) => {
  const s = () => props.summary;
  const newLabel = () => (props.feminine ? 'nuevas' : 'nuevos');
  const masteredLabel = () => (props.feminine ? 'dominadas' : 'dominados');
  // Starts at the old widths, then moves to the new ones, so the gain is something you see.
  const [grown, setGrown] = createSignal(!props.previous);
  onMount(() => {
    if (!grown()) requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
  });
  const width = (now: number, before: number | undefined) => `${pct(grown() || before === undefined ? now : before, s().total)}%`;
  /** One line for the whole day, not a diff against the last visit, so it does not jump between visits. */
  const todayLine = () => {
    const t = props.today;
    if (!t || t.studied === 0) return '';
    const studied = `${t.studied} ${t.studied === 1 ? t.noun[0] : t.noun[1]}`;
    const fresh = t.fresh > 0 ? `, ${t.fresh} ${t.fresh === 1 ? newLabel().slice(0, -1) : newLabel()}` : '';
    return `Hoy has estudiado ${studied}${fresh}`;
  };
  const next = () => nextReviewsLabel(s());
  const known = () => props.knownCount ?? s().metElsewhere;
  return (
    <div class="mt-3">
      <div
        class="flex h-1.5 overflow-hidden rounded-full bg-line/70"
        role="img"
        aria-label={`${s().mastered} ${masteredLabel()}, ${s().learning} aprendiendo, ${s().fresh} ${newLabel()}`}
      >
        <div class="h-full bg-jade transition-[width] duration-700 ease-out" style={{ width: width(s().mastered, props.previous?.mastered) }} />
        <div class="h-full bg-gold transition-[width] duration-700 ease-out" style={{ width: width(s().learning, props.previous?.learning) }} />
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-soft">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-jade" aria-hidden="true" />
          {s().mastered} {masteredLabel()}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-gold" aria-hidden="true" />
          {s().learning} aprendiendo
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-line" aria-hidden="true" />
          {s().fresh} {newLabel()}
        </span>
      </div>
      <Show when={todayLine()}>
        <p class="mt-1.5 text-xs font-medium tabular-nums text-jade">{todayLine()}</p>
      </Show>
      <Show when={known() > 0}>
        <Show
          when={props.onKnown}
          fallback={
            <p class="mt-1.5 text-xs text-ink-soft">
              {known()} ya {known() === 1 ? 'lo conoces' : 'los conoces'} de palabras.
            </p>
          }
        >
          <button
            type="button"
            class="mt-1.5 inline-flex min-h-11 items-center gap-1 text-left text-sm text-ink underline decoration-ink/30 underline-offset-4"
            onClick={() => props.onKnown?.()}
          >
            {known()} ya {known() === 1 ? 'lo conoces' : 'los conoces'} de palabras: {known() === 1 ? 'escríbelo' : 'escríbelos'}
            <Icon name="next" size={14} class="text-ink-faint" />
          </button>
        </Show>
      </Show>
      {/* Secondary facts: one quiet line, so the bottom button stays the only call to action. */}
      <Show when={next() || s().weak > 0}>
        <div class="mt-1 flex min-h-8 flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-ink-soft">
          <Show when={next()}>
            <span>{next()}</span>
          </Show>
          <Show when={next() && s().weak > 0}><span aria-hidden="true">·</span></Show>
          <Show when={s().weak > 0}>
            <button
              type="button"
              class="inline-flex min-h-11 items-center text-ink underline decoration-seal/50 underline-offset-4"
              onClick={() => props.onWeak()}
            >
              {`Repasar ${s().weak} ${s().weak === 1 ? 'flojo' : 'flojos'}`}
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default HomeProgress;
