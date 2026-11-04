import { Component, Show } from 'solid-js';
import Icon from './Icon';
import Pinyin from './Pinyin';
import { StatusDot, type StudyStatus } from './TopicProgress';

interface ResultRowProps {
  hanzi: string;
  pinyin: string;
  meaning: string;
  /** Words outside HSK show «Extra» instead of a level. */
  level?: number;
  /** The level's list is not on this device yet. */
  notDownloaded?: boolean;
  /** Outside the levels the learner studies: the badge goes quiet. */
  outsidePlan?: boolean;
  status?: StudyStatus;
  /** One quiet extra line: an example or the topics. */
  detail?: string;
  highlightQuery?: string;
  label?: string;
  disabled?: boolean;
  class?: string;
  onClick: () => void;
}

/** Hanzi size steps down with length so 1 to 4 characters fit the same column. */
const hanziSize = (text: string) => {
  const n = [...text].length;
  if (n <= 1) return 'text-[2rem]';
  if (n === 2) return 'text-[1.625rem]';
  if (n === 3) return 'text-[1.25rem]';
  return 'text-[1rem]';
};

/** One search result. Word search and character search share it. */
const ResultRow: Component<ResultRowProps> = (props) => (
  <button
    type="button"
    disabled={props.disabled}
    onClick={() => props.onClick()}
    aria-label={props.label}
    class={`flex w-full items-center gap-3 border-b border-line/80 text-left active:bg-ink/5 disabled:opacity-50 ${props.class ?? ''}`}
  >
    <span
      lang="zh-CN"
      class={`w-[4.5rem] shrink-0 whitespace-nowrap text-center font-hanzi leading-none text-ink ${hanziSize(props.hanzi)}`}
    >
      {props.hanzi}
    </span>
    <span class="min-w-0 flex-1">
      <Pinyin text={props.pinyin} highlightQuery={props.highlightQuery} class="block truncate text-[0.9375rem] font-medium" />
      <span class="mt-0.5 block truncate text-sm text-ink first-letter:uppercase">{props.meaning}</span>
      <Show when={props.detail}>
        <span class="mt-0.5 block truncate text-xs text-ink-soft">{props.detail}</span>
      </Show>
    </span>
    <Show when={props.status}>{(status) => <StatusDot status={status()} />}</Show>
    <span
      class="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold tabular-nums"
      classList={{
        'border-line text-ink-soft': !props.outsidePlan,
        'border-dashed border-line/80 text-ink-faint': props.outsidePlan,
      }}
    >
      {props.level ? `HSK ${props.level}` : 'Extra'}
      <Show when={props.notDownloaded}>
        <svg viewBox="0 0 12 12" class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Sin descargar">
          <path d="M6 1.5v6M3.5 5.5 6 8l2.5-2.5M2 10.5h8" />
        </svg>
      </Show>
    </span>
    <Icon name="next" size={16} class="shrink-0 text-ink-faint" />
  </button>
);

export default ResultRow;
