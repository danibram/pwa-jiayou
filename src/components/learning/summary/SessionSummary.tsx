import { Component, For, Show } from 'solid-js';
import Pinyin from '../../Pinyin';
import { RATING_LABEL } from '../present';
import { createDialogFocus } from '../../../utils/dialog';
import { pronoun } from '../../../utils/countNoun';
import type { Rating } from '../../../domain/learning/types';

// Prop types mirror `LearningSessionSummary` in the session store without importing it, so the
// coordinator can pass `summary().recorded` and each item's `results` as they are.

export type SummaryRecordedKind = 'scheduled-review' | 'practice' | 'invalid-attempt' | 'exposure';
export type SummaryOutcome = 'correct' | 'partial' | 'incorrect' | 'invalid';

export interface SummaryAnswer {
  recorded: Exclude<SummaryRecordedKind, 'exposure'>;
  outcome: SummaryOutcome;
  /** Set for a scheduled review only. */
  rating: Rating | null;
}

export interface SummaryItemResult {
  itemId: string;
  /** The word or character as shown, such as 你好. */
  label: string;
  pinyin?: string;
  /** Answers in the order given. Empty for an item that was only taught. */
  results: readonly SummaryAnswer[];
}

export interface SessionSummaryProps {
  open: boolean;
  /** Events the session wrote that still count, by type. */
  recorded: Record<SummaryRecordedKind, number>;
  items: readonly SummaryItemResult[];
  /** Reviews due by the end of tomorrow. */
  dueTomorrow: number;
  /** The soonest due time among the session's items, or null when none has a rating yet. */
  nextDueAt: number | null;
  /** Words seen for the first time today, against the daily budget. */
  newWords: { taught: number; budget: number };
  /** For phrasing `nextDueAt` as today or tomorrow. Defaults to the clock. */
  now?: number;
  onClose: () => void;
  /** Label for the button that leaves the summary. */
  exitLabel?: string;
}

const RATING_ROWS: { rating: Rating; bar: string; text: string }[] = [
  { rating: 'good', bar: 'bg-jade', text: 'text-jade' },
  { rating: 'easy', bar: 'bg-jade/60', text: 'text-jade' },
  { rating: 'hard', bar: 'bg-ink/40', text: 'text-ink' },
  { rating: 'again', bar: 'bg-seal', text: 'text-seal' },
];

const OUTCOME_LABEL: Record<SummaryOutcome, string> = {
  correct: 'acierto',
  partial: 'a medias',
  incorrect: 'fallo',
  invalid: 'no contó',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const startOfDay = (time: number) => {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

/** "hoy a las 18:30", "mañana" or "el 12 de noviembre", by the device's calendar day. */
export const nextDueText = (dueAt: number, now: number): string => {
  const days = Math.round((startOfDay(dueAt) - startOfDay(now)) / 86_400_000);
  if (days <= 0) {
    const time = new Date(Math.max(dueAt, now)).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return `hoy a las ${time}`;
  }
  if (days === 1) return 'mañana';
  return `el ${new Date(dueAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;
};

/** One chip per answer, so a practice answer never reads as a grade. */
const answerChip = (answer: SummaryAnswer) => {
  if (answer.recorded === 'invalid-attempt') return { text: 'No contó', class: 'bg-ink/[0.05] text-ink-faint' };
  if (answer.recorded === 'practice') {
    return {
      text: `Práctica: ${OUTCOME_LABEL[answer.outcome]}`,
      class: answer.outcome === 'correct' ? 'border border-line text-ink-soft' : 'border border-seal/30 text-seal',
    };
  }
  const rating = answer.rating ?? 'again';
  return {
    text: RATING_LABEL[rating],
    class: rating === 'again' ? 'bg-seal/10 text-seal' : rating === 'hard' ? 'bg-ink/[0.07] text-ink' : 'bg-jade/10 text-jade',
  };
};

const ItemRow: Component<{ item: SummaryItemResult }> = (props) => (
  <li class="flex items-center gap-3 py-2" data-item-id={props.item.itemId}>
    <span class="min-w-[3.5rem] shrink-0 font-hanzi text-xl leading-none" lang="zh-CN">{props.item.label}</span>
    <Show when={props.item.pinyin}><Pinyin word text={props.item.pinyin!} class="shrink-0 text-sm" /></Show>
    <span class="flex min-w-0 flex-1 flex-wrap justify-end gap-1">
      <For each={props.item.results}>
        {(answer) => {
          const chip = answerChip(answer);
          return <span class={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${chip.class}`}>{chip.text}</span>;
        }}
      </For>
    </span>
  </li>
);

/**
 * End of a learning session. It separates what changed the schedule (scheduled reviews, with their
 * rating) from practice, which never moves a due date, and from answers that did not count.
 */
const SessionSummary: Component<SessionSummaryProps> = (props) => {
  let dialog: HTMLDivElement | undefined;
  createDialogFocus(() => props.open, () => dialog, () => props.onClose());

  const scheduled = () => props.recorded['scheduled-review'];
  const practice = () => props.recorded.practice;
  const invalid = () => props.recorded['invalid-attempt'];
  const exposures = () => props.recorded.exposure;
  const answered = () => scheduled() + practice();

  const ratings = () => {
    const counts: Record<Rating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const item of props.items) {
      for (const answer of item.results) if (answer.recorded === 'scheduled-review' && answer.rating) counts[answer.rating] += 1;
    }
    return counts;
  };
  const rated = () => props.items.filter((item) => item.results.some((answer) => answer.recorded === 'scheduled-review'));
  const practisedOnly = () => props.items.filter((item) => item.results.length > 0 && !item.results.some((answer) => answer.recorded === 'scheduled-review'));
  const taughtOnly = () => props.items.filter((item) => item.results.length === 0);

  const verdict = () => {
    if (answered() === 0) {
      const n = taughtOnly().length || exposures();
      if (n === 0) return { title: '加油', pinyin: 'jiā yóu', subtitle: 'Ninguna respuesta contó esta vez. Tu calendario no ha cambiado.' };
      return { title: '明天见', pinyin: 'míng tiān jiàn', subtitle: `Has visto ${plural(n, 'palabra nueva', 'palabras nuevas')}. Mañana te ${pronoun(n, 'word')} pregunto.` };
    }
    const facts = [
      scheduled() > 0 ? `${plural(scheduled(), 'respuesta cambió', 'respuestas cambiaron')} tu calendario` : 'Ninguna respuesta cambió tu calendario',
      practice() > 0 ? `${plural(practice(), 'fue', 'fueron')} práctica` : '',
    ].filter(Boolean);
    const subtitle = `${facts.join(' y ')}.`;
    // Judged on what the schedule saw; a practice-only session is judged on its practice.
    const recalled = scheduled() > 0
      ? (scheduled() - ratings().again) / scheduled()
      : props.items.reduce((sum, item) => sum + item.results.filter((a) => a.recorded === 'practice' && a.outcome === 'correct').length, 0) / practice();
    if (recalled === 1) return { title: '太棒了', pinyin: 'tài bàng le', subtitle };
    if (recalled >= 0.85) return { title: '很好', pinyin: 'hěn hǎo', subtitle };
    if (recalled >= 0.6) return { title: '不错', pinyin: 'bú cuò', subtitle };
    return { title: '加油', pinyin: 'jiā yóu', subtitle };
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-paper/90 backdrop-blur-md animate-fade">
        <div
          class="w-full max-w-md bg-surface rounded-t-card sm:rounded-card border border-line shadow-card px-6 pt-7 animate-rise max-h-[92dvh] overflow-y-auto"
          style={{ 'padding-bottom': 'max(env(safe-area-inset-bottom), 1.5rem)' }}
          role="dialog"
          ref={dialog}
          tabIndex={-1}
          aria-modal="true"
          aria-labelledby="session-summary-title"
        >
          <div class="text-center">
            <h2 id="session-summary-title" class="font-hanzi text-5xl font-semibold leading-none" lang="zh-CN">{verdict().title}</h2>
            <Pinyin text={verdict().pinyin} class="mt-2 block text-sm font-medium" />
            <p class="mx-auto mt-2 max-w-[18rem] text-[0.9375rem] leading-snug text-ink-soft">{verdict().subtitle}</p>
          </div>

          <Show when={scheduled() > 0}>
            <div class="mt-6" data-testid="summary-scheduled">
              <div class="eyebrow mb-2 text-center">{plural(scheduled(), 'repaso cambió', 'repasos cambiaron')} tu calendario</div>
              <div class="flex h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <For each={RATING_ROWS}>
                  {(row) => <div class={`h-full ${row.bar}`} style={{ width: `${(ratings()[row.rating] / scheduled()) * 100}%` }} />}
                </For>
              </div>
              <dl class="mt-3 grid grid-cols-4 text-center">
                <For each={RATING_ROWS}>
                  {(row) => (
                    <div>
                      <dd
                        class="font-display text-2xl font-semibold tabular-nums leading-none"
                        classList={{ [row.text]: ratings()[row.rating] > 0, 'text-ink-faint': ratings()[row.rating] === 0 }}
                      >
                        {ratings()[row.rating]}
                      </dd>
                      <dt class="mt-1 text-xs text-ink-soft">{RATING_LABEL[row.rating]}</dt>
                    </div>
                  )}
                </For>
              </dl>
            </div>
          </Show>

          {/* One fact per row, as in the old summary. */}
          <div class="mt-5 divide-y divide-line/70 border-y border-line/70 text-sm">
            <Show when={practice() > 0}>
              <div class="flex items-center justify-between gap-3 py-2.5 tabular-nums" data-testid="summary-practice">
                <span class="text-ink-soft">Práctica, sin cambiar fechas</span>
                <span class="font-semibold text-ink">{plural(practice(), 'respuesta', 'respuestas')}</span>
              </div>
            </Show>
            <Show when={exposures() > 0}>
              <div class="flex items-center justify-between gap-3 py-2.5 tabular-nums">
                <span class="text-ink-soft">Lecciones vistas</span>
                <span class="font-semibold text-ink">{exposures()}</span>
              </div>
            </Show>
            <Show when={invalid() > 0}>
              <div class="flex items-center justify-between gap-3 py-2.5 tabular-nums" data-testid="summary-invalid">
                <span class="text-ink-soft">No contaron (audio o contenido cambiado)</span>
                <span class="font-semibold text-ink">{invalid()}</span>
              </div>
            </Show>
            <div class="flex items-center justify-between gap-3 py-2.5 tabular-nums">
              <span class="text-ink-soft">Palabras nuevas hoy</span>
              <span class="font-semibold text-ink">{props.newWords.taught} de {props.newWords.budget}</span>
            </div>
            <div class="flex items-center justify-between gap-3 py-2.5 tabular-nums">
              <span class="text-ink-soft">Mañana</span>
              <span class="font-semibold text-ink">{plural(props.dueTomorrow, 'repaso', 'repasos')}</span>
            </div>
            <Show when={props.nextDueAt !== null}>
              <div class="flex items-center justify-between gap-3 py-2.5">
                <span class="shrink-0 text-ink-soft">Próximo repaso</span>
                <span class="text-right text-ink">{nextDueText(props.nextDueAt!, props.now ?? Date.now())}</span>
              </div>
            </Show>
          </div>

          <Show when={rated().length > 0}>
            <section class="mt-6" aria-label="Repasos con nota">
              <div class="eyebrow mb-2">Repasos con nota</div>
              <ul class="divide-y divide-line/60 rounded-tile bg-ink/[0.03] px-3">
                <For each={rated()}>{(item) => <ItemRow item={item} />}</For>
              </ul>
            </section>
          </Show>
          <Show when={practisedOnly().length > 0}>
            <section class="mt-6" aria-label="Solo práctica">
              <div class="eyebrow mb-2">Solo práctica · su próxima fecha no cambia</div>
              <ul class="divide-y divide-line/60 rounded-tile bg-ink/[0.03] px-3">
                <For each={practisedOnly()}>{(item) => <ItemRow item={item} />}</For>
              </ul>
            </section>
          </Show>
          <Show when={taughtOnly().length > 0}>
            <section class="mt-6" aria-label="Solo lección">
              <div class="eyebrow mb-2">Solo lección</div>
              <ul class="divide-y divide-line/60 rounded-tile bg-ink/[0.03] px-3">
                <For each={taughtOnly()}>{(item) => <ItemRow item={item} />}</For>
              </ul>
            </section>
          </Show>

          <div class="mt-7">
            <button type="button" onClick={() => props.onClose()} class="btn-ink h-14 w-full text-[0.9375rem]">
              {props.exitLabel ?? 'Volver al inicio'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default SessionSummary;
