import { Component, For, Show, createMemo, createSignal } from 'solid-js';

interface ActivityCalendarProps {
  /** Answers and first looks per local day, "2026-11-01" → 34. Only whether a day has any is shown. */
  activity: Record<string, number>;
  /** Today's date, injectable for tests. */
  today?: Date;
}

/** The most weeks shown once there is that much history. */
const MAX_WEEKS = 7;
const DAY_MS = 86_400_000;
const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const key = (date: Date) => date.toLocaleDateString('sv-SE');

/** Monday-based weekday, 0 for Monday. */
const weekday = (date: Date) => (date.getDay() + 6) % 7;

/** Four jade steps: none, a little, a session, a big day. */
const level = (count: number) => (count === 0 ? 0 : count < 10 ? 1 : count < 30 ? 2 : 3);
const TINT = ['bg-line/40', 'bg-jade/30', 'bg-jade/60', 'bg-jade'];

interface Day {
  day: string;
  count: number;
  future: boolean;
  today: boolean;
  date: Date;
}

/**
 * Up to seven weeks of practice, one row per week, so a streak is something you can see.
 * It starts at the week of the first practised day, so day one shows a single row and not six empty ones.
 */
const ActivityCalendar: Component<ActivityCalendarProps> = (props) => {
  const now = () => props.today ?? new Date();
  const weeks = createMemo(() => {
    const today = now();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekday(today));
    const first = Object.keys(props.activity).filter((day) => props.activity[day] > 0).sort()[0];
    const firstDate = first ? new Date(`${first}T12:00:00`) : today;
    const back = Math.max(0, Math.ceil((monday.getTime() - firstDate.getTime()) / (7 * DAY_MS)));
    const count = Math.min(MAX_WEEKS, back + 1);
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (count - 1) * 7);
    const days: Day[] = Array.from({ length: count * 7 }, (_, i) => {
      const date = new Date(start.getTime() + i * DAY_MS + 12 * 3_600_000);
      const day = key(date);
      return { day, date, count: props.activity[day] ?? 0, future: date.getTime() > today.getTime() + DAY_MS / 2, today: day === key(today) };
    });
    return Array.from({ length: count }, (_, w) => days.slice(w * 7, w * 7 + 7));
  });
  const current = () => weeks()[weeks().length - 1];
  /** The month label sits on the first row and on any week where a month starts. */
  const monthOf = (week: Day[], index: number) => {
    const first = week.find((d) => d.date.getDate() === 1);
    if (first) return MONTHS[first.date.getMonth()];
    return index === 0 ? MONTHS[week[0].date.getMonth()] : '';
  };
  // Days, not answers: the log counts every answer and first look, retries included, while a
  // session summary counts each word once, so a number here would not match the summary.
  const activeDays = () => current().filter((d) => !d.future && d.count > 0).length;
  const [picked, setPicked] = createSignal<Day | null>(null);
  /** "domingo 2 nov: practicaste", read aloud for each day and shown under the grid when tapped. */
  const describe = (d: Day) =>
    `${d.today ? 'Hoy, ' : ''}${WEEKDAYS[d.date.getDay()]} ${d.date.getDate()} ${MONTHS[d.date.getMonth()]}: ${d.count > 0 ? 'practicaste' : 'sin práctica'}`;
  const summary = () =>
    activeDays() === 0 ? 'Esta semana aún no has practicado' : `Esta semana has practicado ${activeDays()} ${activeDays() === 1 ? 'día' : 'días'}`;

  return (
    <section class="mt-4" aria-label={summary()}>
      <h2 class="text-sm font-semibold text-ink">Tu práctica</h2>
      <p class="mt-0.5 text-xs tabular-nums text-ink-soft">{summary()}</p>
      <div class="mt-2.5 grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-x-1 text-[0.6875rem] leading-none text-ink-faint">
        <span aria-hidden="true" />
        <For each={LETTERS}>{(letter) => <span class="pb-0.5 text-center" aria-hidden="true">{letter}</span>}</For>
        <For each={weeks()}>
          {(week, index) => (
            <>
              <span class="flex h-6 items-center" aria-hidden="true">{monthOf(week, index())}</span>
              <For each={week}>
                {(d) => (
                  <Show when={!d.future} fallback={<span class="flex h-6 items-center" aria-hidden="true"><span class="h-3 w-full rounded-[3px] border border-dashed border-line/60" /></span>}>
                    {/* The visible cell stays small; the button around it is the tap target. */}
                    <button
                      type="button"
                      class="flex h-6 items-center"
                      aria-label={describe(d)}
                      aria-pressed={picked()?.day === d.day}
                      onClick={() => setPicked((p) => (p?.day === d.day ? null : d))}
                    >
                      <span
                        class={`h-3 w-full rounded-[3px] ${TINT[level(d.count)]}`}
                        classList={{ 'ring-2 ring-ink ring-offset-1 ring-offset-paper': d.today, 'outline outline-1 outline-ink/50': picked()?.day === d.day && !d.today }}
                      />
                    </button>
                  </Show>
                )}
              </For>
            </>
          )}
        </For>
      </div>
      <Show when={picked()}>
        {(d) => <p class="mt-1.5 text-xs text-ink-soft first-letter:uppercase" role="status">{describe(d())}</p>}
      </Show>
      <Show when={!picked() && current().some((d) => d.today)}>
        <div class="mt-1 grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-1 text-[0.6875rem] text-ink-soft" aria-hidden="true">
          <span />
          <For each={current()}>{(d) => <span class="text-center font-medium">{d.today ? 'hoy' : ''}</span>}</For>
        </div>
      </Show>
    </section>
  );
};

export default ActivityCalendar;
