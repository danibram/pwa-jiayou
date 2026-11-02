import { Component, For, Show } from 'solid-js';
import type { HskLevel } from '../types';
import Icon from './Icon';

interface LevelChipsProps {
  levels: HskLevel[];
  isSelected: (level: HskLevel) => boolean;
  onToggle: (level: HskLevel) => void;
  count: (level: HskLevel) => number;
  mastered: (level: HskLevel) => number;
  /** Started but not mastered yet. Drawn after the mastered part of each chip's bar. */
  learning?: (level: HskLevel) => number;
  /** "caracteres" or "palabras", for the screen reader label. */
  unit: string;
  /** The list is not on this device yet. Tapping it asks to download. */
  needsDownload?: (level: HskLevel) => boolean;
}

/** HSK level picker. Never more than three per row, so the numeral and the tick both fit on a phone. */
const LevelChips: Component<LevelChipsProps> = (props) => {
  const columns = () => {
    const n = Math.max(1, props.levels.length);
    if (n === 4) return 2;
    return Math.min(3, n);
  };
  return (
    <div
      class="grid gap-2"
      style={{ 'grid-template-columns': `repeat(${columns()}, minmax(0, 1fr))` }}
      role="group"
      aria-label="Niveles HSK"
    >
      <For each={props.levels}>
        {(level) => {
          const missing = () => props.needsDownload?.(level) ?? false;
          const selected = () => !missing() && props.isSelected(level);
          const detail = () => {
            const done = props.mastered(level);
            return done > 0 ? `${done} de ${props.count(level)}` : `${props.count(level)}`;
          };
          return (
            <button
              type="button"
              role="checkbox"
              aria-checked={selected()}
              aria-label={missing() ? `HSK ${level}, ${props.count(level)} ${props.unit}, sin descargar` : `HSK ${level}, ${detail()} ${props.unit}`}
              onClick={() => props.onToggle(level)}
              class="relative flex min-h-[3.5rem] min-w-0 items-center gap-2 overflow-hidden rounded-tile border-2 px-3 py-2 text-left transition-colors duration-200 ease-out active:scale-[0.97]"
              classList={{
                'border-ink bg-surface text-ink': selected(),
                'border-line bg-surface/60 text-ink-soft': !selected(),
              }}
            >
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline gap-1">
                  <span class="text-[0.625rem] font-semibold tracking-wider text-ink-faint">HSK</span>
                  <span class="font-display text-xl font-semibold leading-none">{level}</span>
                </span>
                <span class="mt-1 block truncate text-[0.6875rem] leading-tight tabular-nums text-ink-soft lg:text-xs">{detail()}</span>
              </span>
              <Show when={!missing() && props.count(level) > 0 && props.mastered(level) + (props.learning?.(level) ?? 0) > 0}>
                <span class="pointer-events-none absolute inset-x-3 bottom-1.5 flex h-[3px] overflow-hidden rounded-full bg-line/60" aria-hidden="true">
                  <span class="h-full bg-jade" style={{ width: `${(props.mastered(level) / props.count(level)) * 100}%` }} />
                  <span class="h-full bg-gold" style={{ width: `${((props.learning?.(level) ?? 0) / props.count(level)) * 100}%` }} />
                </span>
              </Show>
              <Show
                when={!missing()}
                fallback={
                  <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-ink-faint" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 4v11 M7 10l5 5 5-5 M5 20h14" />
                  </svg>
                }
              >
                <span
                  class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  classList={{ 'border-ink bg-ink text-paper': selected(), 'border-line': !selected() }}
                  aria-hidden="true"
                >
                  <Show when={selected()}>
                    <Icon name="check" size={10} />
                  </Show>
                </span>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
};

export default LevelChips;
