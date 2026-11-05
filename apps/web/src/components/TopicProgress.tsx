import { Component, Show } from 'solid-js';

/** The Home taxonomy. Every page names a status with these words and these dots. */
export type StudyStatus = 'new' | 'learning' | 'mastered';

export const statusWord = (status: StudyStatus, feminine: boolean, count = 1) => {
  const many = count !== 1;
  if (status === 'learning') return 'aprendiendo';
  if (status === 'mastered') return feminine ? (many ? 'dominadas' : 'dominada') : many ? 'dominados' : 'dominado';
  return feminine ? (many ? 'nuevas' : 'nueva') : many ? 'nuevos' : 'nuevo';
};

const DOT: Record<StudyStatus, string> = {
  new: 'bg-line',
  learning: 'bg-gold',
  mastered: 'bg-jade',
};

export const StatusDot: Component<{ status: StudyStatus }> = (props) => (
  <span class={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[props.status]}`} aria-hidden="true" />
);

/** A single status with its dot, as the word sheet and the cards show it. */
export const StatusTag: Component<{ status: StudyStatus; feminine: boolean; class?: string }> = (props) => (
  <span class={`inline-flex items-center gap-1.5 text-sm text-ink-soft ${props.class ?? ''}`}>
    <StatusDot status={props.status} />
    <span class="first-letter:uppercase">{statusWord(props.status, props.feminine)}</span>
  </span>
);

export interface TopicCounts {
  total: number;
  learning: number;
  mastered: number;
}

const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);

/** Thin jade and gold line under a topic row, the same colours as Home's bar. */
export const TopicBar: Component<{ counts: TopicCounts; class?: string }> = (props) => (
  <span class={`flex h-1 overflow-hidden rounded-full bg-line/70 ${props.class ?? ''}`} aria-hidden="true">
    <span class="h-full bg-jade" style={{ width: `${pct(props.counts.mastered, props.counts.total)}%` }} />
    <span class="h-full bg-gold" style={{ width: `${pct(props.counts.learning, props.counts.total)}%` }} />
  </span>
);

/** "37 palabras, sin empezar" or "37 palabras: 3 dominadas, 9 aprendiendo". The noun follows `feminine`. */
export const topicCountsLine = (counts: TopicCounts, feminine: boolean) => {
  const noun = feminine ? (counts.total === 1 ? 'palabra' : 'palabras') : counts.total === 1 ? 'carácter' : 'caracteres';
  const head = `${counts.total} ${noun}`;
  const started = counts.learning + counts.mastered;
  if (started === 0) return `${head}, sin empezar`;
  if (counts.mastered === counts.total) return `${head}, ${feminine ? 'todas dominadas' : 'todos dominados'}`;
  const parts: string[] = [];
  if (counts.mastered > 0) parts.push(`${counts.mastered} ${statusWord('mastered', feminine, counts.mastered)}`);
  if (counts.learning > 0) parts.push(`${counts.learning} aprendiendo`);
  return `${head}: ${parts.join(', ')}`;
};

export const TopicCountsText: Component<{ counts: TopicCounts; feminine: boolean }> = (props) => (
  <Show when={props.counts.total > 0}>
    <span class="tabular-nums">{topicCountsLine(props.counts, props.feminine)}</span>
  </Show>
);
