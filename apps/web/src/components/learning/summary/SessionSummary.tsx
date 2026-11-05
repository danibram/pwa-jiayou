import { Component, For, onMount, Show } from 'solid-js';
import Icon from '../../Icon';
import Pinyin from '../../Pinyin';
import { RATING_LABEL } from '../present';
import { pronoun } from '../../../utils/countNoun';
import type { Rating } from '@jiayou/learning/types';

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
  /** What it means, so a missed word can be read again without opening it. */
  gloss?: string;
  /** The session gave it a lesson. */
  taught?: boolean;
  /** Answers in the order given. Empty for an item that was only taught. */
  results: readonly SummaryAnswer[];
}

export interface SessionSummaryProps {
  /** Events the session wrote that still count, by type. */
  recorded: Record<SummaryRecordedKind, number>;
  items: readonly SummaryItemResult[];
  /** "Ya la sé" claims in the session, shown apart from the lessons. */
  alreadyKnown?: number;
  /** What Hoy will hold tomorrow if nothing more is studied today. */
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
  /** Opens a word of the session to look at it again. Without it the rows are plain. */
  onOpenItem?: (itemId: string) => void;
}

const RATING_ROWS: { rating: Rating; bar: string; text: string }[] = [
  { rating: 'good', bar: 'bg-jade', text: 'text-jade' },
  { rating: 'easy', bar: 'bg-jade/60', text: 'text-jade' },
  { rating: 'hard', bar: 'bg-ink/40', text: 'text-ink' },
  { rating: 'again', bar: 'bg-seal', text: 'text-seal' },
];


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

const misses = (item: SummaryItemResult) =>
  item.results.filter((answer) => answer.recorded !== 'invalid-attempt' && (answer.outcome === 'incorrect' || answer.rating === 'again')).length;

/**
 * One chip per word, not per answer. A miss counts; otherwise a scheduled review names its rating and
 * practice says "Bien" like the card did.
 */
const wordChip = (item: SummaryItemResult): { text: string; class: string; dot?: boolean } | null => {
  const missed = misses(item);
  if (missed > 0) return { text: plural(missed, 'fallo', 'fallos'), class: 'bg-ink/[0.06] text-ink', dot: true };
  const counted = item.results.filter((answer) => answer.recorded !== 'invalid-attempt');
  if (counted.length === 0) return item.results.length > 0 ? { text: 'No contó', class: 'bg-ink/[0.05] text-ink-faint' } : null;
  const graded = [...counted].reverse().find((answer) => answer.recorded === 'scheduled-review' && answer.rating);
  if (graded?.rating) return { text: RATING_LABEL[graded.rating], class: graded.rating === 'hard' ? 'bg-ink/[0.07] text-ink' : 'bg-jade/10 text-jade' };
  return { text: counted.some((answer) => answer.outcome === 'partial') ? 'A medias' : 'Bien', class: 'border border-line text-ink-soft' };
};

const ItemRow: Component<{ item: SummaryItemResult; onOpen?: (itemId: string) => void }> = (props) => {
  const body = (
    <>
      <span class="min-w-[3.5rem] shrink-0 font-hanzi text-xl leading-none" lang="zh-CN">{props.item.label}</span>
      <span class="min-w-0 shrink">
        <Show when={props.item.pinyin}><Pinyin word text={props.item.pinyin!} class="block text-sm leading-tight" /></Show>
        <Show when={props.item.gloss}><span class="block truncate text-xs text-ink-soft first-letter:uppercase">{props.item.gloss}</span></Show>
      </span>
      <span class="flex flex-1 shrink-0 justify-end">
        <Show when={wordChip(props.item)}>{(chip) => (
          <span class={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${chip().class}`}>
            <Show when={chip().dot}><span class="h-1.5 w-1.5 rounded-full bg-seal" aria-hidden="true" /></Show>
            {chip().text}
          </span>
        )}</Show>
      </span>
    </>
  );
  return (
    <li data-item-id={props.item.itemId}>
      <Show when={props.onOpen} fallback={<div class="flex items-center gap-3 py-2">{body}</div>}>
        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-3 py-2 text-left active:bg-ink/5"
          aria-label={`Ver ${props.item.label}`}
          onClick={() => props.onOpen?.(props.item.itemId)}
        >
          {body}
          <Icon name="next" size={14} class="shrink-0 text-ink-faint" />
        </button>
      </Show>
    </li>
  );
};

/**
 * End of a learning session. It separates what changed the schedule (scheduled reviews, with their
 * rating) from practice, which never moves a due date, and from answers that did not count.
 */
const SessionSummary: Component<SessionSummaryProps> = (props) => {
  let heading: HTMLHeadingElement | undefined;
  // The page replaces the card under the learner's finger: focus moves to what it says.
  onMount(() => heading?.focus({ preventScroll: true }));

  const scheduled = () => props.recorded['scheduled-review'];
  const practice = () => props.recorded.practice;
  const invalid = () => props.recorded['invalid-attempt'];
  const exposures = () => props.recorded.exposure;
  const claimed = () => props.alreadyKnown ?? 0;
  const lessons = () => exposures() - claimed();
  const answered = () => scheduled() + practice();

  const ratings = () => {
    const counts: Record<Rating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const item of props.items) {
      for (const answer of item.results) if (answer.recorded === 'scheduled-review' && answer.rating) counts[answer.rating] += 1;
    }
    return counts;
  };
  /** The words to look at again first: any miss. Then the ones that went well, then lessons only. */
  const toReview = () => props.items.filter((item) => misses(item) > 0);
  const wentWell = () => props.items.filter((item) => item.results.length > 0 && misses(item) === 0);
  const taughtOnly = () => props.items.filter((item) => item.results.length === 0);
  const reviewedWords = () => props.items.filter((item) => item.results.some((answer) => answer.recorded === 'scheduled-review')).length;
  const practisedWords = () => props.items.filter((item) => item.results.some((answer) => answer.recorded === 'practice')).length;

  /** What the learner did, in their terms: words learned, reviewed or practised. */
  /** Words, not lessons: a word taught again after a miss is still one word. */
  const learnedWords = () => {
    const flagged = props.items.filter((item) => item.taught).length;
    return flagged > 0 ? flagged : lessons();
  };
  const subtitle = () => {
    if (learnedWords() > 0) {
      const learned = `Has visto ${plural(learnedWords(), 'palabra nueva', 'palabras nuevas')}`;
      if (answered() === 0) return `${learned}. Mañana te ${pronoun(learnedWords(), 'word')} pregunto.`;
      return reviewedWords() > 0 ? `${learned} y has repasado ${reviewedWords()}.` : `${learned}.`;
    }
    if (reviewedWords() > 0) return practisedWords() > 0 ? `Has repasado ${plural(reviewedWords(), 'palabra', 'palabras')} y has practicado ${practisedWords()}.` : `Has repasado ${plural(reviewedWords(), 'palabra', 'palabras')}.`;
    if (practisedWords() > 0) return `Has practicado ${plural(practisedWords(), 'palabra', 'palabras')}.`;
    return 'Ninguna respuesta ha contado esta vez.';
  };

  const verdict = () => {
    if (answered() === 0) {
      const n = taughtOnly().length || exposures();
      if (n === 0) return { title: '加油', pinyin: 'jiā yóu' };
      return { title: '明天见', pinyin: 'míng tiān jiàn' };
    }
    // Judged on what the schedule saw; a practice-only session is judged on its practice.
    const recalled = scheduled() > 0
      ? (scheduled() - ratings().again) / scheduled()
      : props.items.reduce((sum, item) => sum + item.results.filter((a) => a.recorded === 'practice' && a.outcome === 'correct').length, 0) / practice();
    if (recalled === 1) return { title: '太棒了', pinyin: 'tài bàng le' };
    if (recalled >= 0.85) return { title: '很好', pinyin: 'hěn hǎo' };
    if (recalled >= 0.6) return { title: '不错', pinyin: 'bú cuò' };
    return { title: '加油', pinyin: 'jiā yóu' };
  };
  /** Only a review due later today needs its own line; tomorrow's are already counted. */
  const dueToday = () => props.nextDueAt !== null && nextDueText(props.nextDueAt, props.now ?? Date.now()).startsWith('hoy');

  const list = (label: string, items: SummaryItemResult[], testId: string) => (
    <Show when={items.length > 0}>
      <section class="mt-6" aria-label={label} data-testid={testId}>
        <h3 class="eyebrow mb-1">{label}</h3>
        <ul class="divide-y divide-line/60">
          <For each={items}>{(item) => <ItemRow item={item} onOpen={props.onOpenItem} />}</For>
        </ul>
      </section>
    </Show>
  );

  return (
    <section class="flex min-h-0 flex-1 flex-col animate-rise" aria-labelledby="session-summary-title" data-testid="session-summary">
        {/* A mask, not an overlay: the page's paper texture shows through the fade. */}
        <div class="min-h-0 flex-1 overflow-y-auto px-1 pb-6 pt-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]">
          <div class="text-center">
            <h2 id="session-summary-title" ref={heading} tabIndex={-1} class="outline-none font-hanzi text-5xl font-semibold leading-none" lang="zh-CN">{verdict().title}</h2>
            <Pinyin text={verdict().pinyin} class="mt-2 block text-sm font-medium" />
            <p class="mx-auto mt-2 max-w-[18rem] text-[0.9375rem] leading-snug text-ink-soft">{subtitle()}</p>
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

          {/* Two facts that matter for tomorrow, side by side. */}
          <dl class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-tile border border-line/70 bg-line/70 text-center">
            <div class="bg-paper px-2 py-3">
              <dt class="text-xs text-ink-soft">Mañana</dt>
              <dd class="mt-0.5 font-semibold tabular-nums text-ink" data-testid="summary-tomorrow">{plural(props.dueTomorrow, 'repaso', 'repasos')}</dd>
            </div>
            <div class="bg-paper px-2 py-3">
              <dt class="text-xs text-ink-soft">Nuevas hoy</dt>
              <dd class="mt-0.5 font-semibold tabular-nums text-ink" data-testid="summary-new">{props.newWords.taught} de {props.newWords.budget}</dd>
            </div>
          </dl>
          <Show when={dueToday()}>
            <p class="mt-2 text-center text-sm text-ink-soft" data-testid="summary-next">Próximo repaso {nextDueText(props.nextDueAt!, props.now ?? Date.now())}</p>
          </Show>

          {list('Para repasar', toReview(), 'summary-review')}
          {list('Bien', wentWell(), 'summary-good')}
          {list('Vistas por primera vez', taughtOnly(), 'summary-taught')}

          <div class="mt-4 space-y-1 text-center text-xs text-ink-soft">
            <Show when={claimed() > 0}>
              <p data-testid="summary-already-known">Ya sabías {plural(claimed(), 'palabra', 'palabras')}: vuelven más adelante.</p>
            </Show>
            {/* Only worth saying when the session mixed both kinds of answer. */}
            <Show when={practice() > 0 && scheduled() > 0}>
              <p data-testid="summary-practice">La práctica no cambia cuándo vuelven tus repasos.</p>
            </Show>
            <Show when={invalid() > 0}>
              <p data-testid="summary-invalid">{plural(invalid(), 'respuesta no contó', 'respuestas no contaron')}: audio o contenido cambiado.</p>
            </Show>
          </div>
        </div>
        <div class="relative shrink-0 pt-3">
          <button type="button" onClick={() => props.onClose()} class="btn-ink h-14 w-full text-[0.9375rem]">
            {props.exitLabel ?? 'Volver al inicio'}
          </button>
        </div>
    </section>
  );
};

export default SessionSummary;
