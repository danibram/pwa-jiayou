import { For, JSX, Show } from 'solid-js';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** A smaller second line, as in the voice picker. */
  detail?: string;
  /** Extra classes for one option, such as a nudge animation. */
  class?: string;
}

interface SegmentedPickerProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  class?: string;
  /** Tighter cells for short labels, like tone digits beside a syllable field. */
  compact?: boolean;
}

/** One choice out of a few, shown side by side. The voice picker and the stroke practice modes share it. */
function SegmentedPicker<T extends string>(props: SegmentedPickerProps<T>): JSX.Element {
  return (
    <div
      class={`grid gap-0.5 rounded-tile border border-line p-1 ${props.class ?? ''}`}
      classList={{ 'gap-1': !props.compact }}
      style={{
        'grid-template-columns': props.compact
          ? `repeat(${props.options.length}, minmax(0, 1.65rem))`
          : `repeat(${props.options.length}, minmax(0, 1fr))`,
      }}
      role="radiogroup"
      aria-label={props.label}
    >
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === option.value}
            class={`flex flex-col items-center justify-center text-center leading-tight transition-colors ${option.class ?? ''}`}
            classList={{
              'min-h-11 rounded-[0.8rem] px-2 py-1.5': !props.compact,
              'min-h-9 w-full rounded-lg px-0 py-1': !!props.compact,
              'bg-ink text-paper': props.value === option.value,
              'text-ink-soft': props.value !== option.value,
            }}
            onClick={() => props.onChange(option.value)}
          >
            <span class="text-sm font-semibold">{option.label}</span>
            <Show when={option.detail}>
              <span class="text-xs opacity-80">{option.detail}</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}

export default SegmentedPicker;
