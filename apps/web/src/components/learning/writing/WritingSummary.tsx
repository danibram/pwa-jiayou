import { Component, For, Show } from 'solid-js';
import type { Rating } from '@jiayou/learning/types';
import { RATING_LABEL } from '../present';

export interface WritingSummaryItem {
  itemId: string;
  /** The character as shown. */
  label: string;
  /** Answers in the order given, voided ones left out. Empty for a character only watched. */
  results: readonly { recorded: 'scheduled-review' | 'practice' | 'invalid-attempt'; outcome: 'correct' | 'partial' | 'incorrect' | 'invalid'; rating: Rating | null }[];
}

interface WritingSummaryProps {
  items: readonly WritingSummaryItem[];
  /** Characters still pending today after this session. */
  pendingLeft: number;
  onClose: () => void;
  exitLabel: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One answer as a short word: the rating of a review, or what tracing went like. */
const resultWord = (result: WritingSummaryItem['results'][number]): string => {
  if (result.recorded === 'invalid-attempt') return 'no contó';
  if (result.recorded === 'scheduled-review' && result.rating) return RATING_LABEL[result.rating].toLowerCase();
  return result.outcome === 'correct' ? 'calcado' : 'con errores';
};

/** The end of a Trazos session: each character and how it went. */
const WritingSummary: Component<WritingSummaryProps> = (props) => {
  const reviews = () => props.items.reduce((sum, item) => sum + item.results.filter((result) => result.recorded === 'scheduled-review').length, 0);
  const watched = () => props.items.filter((item) => item.results.length === 0).length;
  const line = () => {
    const parts: string[] = [];
    if (reviews() > 0) parts.push(plural(reviews(), 'repaso de memoria', 'repasos de memoria'));
    const practised = props.items.length - watched();
    if (practised > 0) parts.push(plural(practised, 'carácter escrito', 'caracteres escritos'));
    return parts.length > 0 ? `${parts.join(' · ')}.` : 'Has visto el orden de los trazos.';
  };
  return (
    <div class="m-auto w-full max-w-[22rem] text-center animate-rise">
      <p class="font-display text-2xl font-semibold">Trazos hechos</p>
      <p class="mt-2 text-sm text-ink-soft">{line()}</p>
      <ul class="mt-4 divide-y divide-line/80 rounded-card border border-line/80 bg-surface text-left">
        <For each={props.items}>
          {(item) => (
            <li class="flex items-center gap-3 px-3 py-2">
              <span class="font-hanzi text-2xl leading-none" lang="zh-CN">{item.label}</span>
              <span class="min-w-0 flex-1 truncate text-sm text-ink-soft">
                {item.results.length > 0 ? item.results.map(resultWord).join(', ') : 'visto'}
              </span>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.pendingLeft > 0}>
        <p class="mt-3 text-sm text-ink-soft">Quedan {plural(props.pendingLeft, 'carácter pendiente', 'caracteres pendientes')} para hoy.</p>
      </Show>
      <button type="button" class="btn-ink mt-6 h-12 w-full px-8" onClick={() => props.onClose()}>{props.exitLabel}</button>
    </div>
  );
};

export default WritingSummary;
