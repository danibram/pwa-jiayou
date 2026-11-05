// Deterministic multi-day study simulator: session policy (buildSession, requeueAfterAgain),
// evaluator and FSRS together. No Math.random, no Date.now: every instant is explicit and every
// draw comes from a seeded generator.
import { evaluateAttempt } from '../../src/evaluation/index.ts';
import {
  addLocalDays,
  effectiveItemEvents,
  eligibleFromEvents,
  pendingToday,
  tomorrowLoad,
  type LocalDayRule,
  type Scheduler,
} from '../../src/scheduler/index.ts';
import {
  buildSession,
  DEFAULT_SESSION_SETTINGS,
  requeueAfterAgain,
  seededShuffle,
  type LeftOutReason,
  type PlannedCard,
  type PoolItem,
  type SessionPlan,
  type SessionScope,
  type SessionSettings,
} from '../../src/sessions/index.ts';
import type {
  AttemptAction,
  CardReason,
  ContentReference,
  Exercise,
  ItemId,
  LearningEvent,
  LocalDay,
  Rating,
  SchedulerState,
  SessionMode,
  Timestamp,
} from '../../src/types.ts';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------------------------
// Time zones

/** A day rule that can also turn a local wall-clock time into an instant. */
export interface Zone extends LocalDayRule {
  name: string;
  /** The instant of `hours` (fractional allowed) local time on `day`. Throws for a time that does not exist. */
  at(day: LocalDay, hours: number): Timestamp;
}

const isoDay = (time: Timestamp) => new Date(time).toISOString().slice(0, 10) as LocalDay;
const utcMidnight = (day: LocalDay) => Date.parse(`${day}T00:00:00Z`);

export const utcZone: Zone = {
  name: 'UTC',
  localDay: isoDay,
  nextLocalMidnight: (now) => Math.floor(now / DAY) * DAY + DAY,
  at: (day, hours) => utcMidnight(day) + hours * HOUR,
};

/** Day of month of the last Sunday of `month` (0-based) in `year`. */
const lastSunday = (year: number, month: number): number => {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
};

/**
 * Europe/Madrid built by hand (EU rule): CET +1h, CEST +2h from the last Sunday of March 01:00 UTC
 * to the last Sunday of October 01:00 UTC. The DST test checks it against Intl before relying on it.
 */
const madridOffset = (time: Timestamp): number => {
  const year = new Date(time).getUTCFullYear();
  const start = Date.UTC(year, 2, lastSunday(year, 2), 1);
  const end = Date.UTC(year, 9, lastSunday(year, 9), 1);
  return time >= start && time < end ? 2 * HOUR : HOUR;
};

const fromLocal = (wall: Timestamp): Timestamp | null => {
  // Try CET first, so an ambiguous October time resolves to the later instant.
  for (const offset of [HOUR, 2 * HOUR]) {
    const candidate = wall - offset;
    if (madridOffset(candidate) === offset) return candidate;
  }
  return null;
};

export const madridZone: Zone = {
  name: 'Europe/Madrid',
  localDay: (now) => isoDay(now + madridOffset(now)),
  nextLocalMidnight(now) {
    const next = addLocalDays(madridZone.localDay(now), 1);
    const instant = fromLocal(utcMidnight(next));
    if (instant === null) throw new Error(`No local midnight on ${next}`);
    return instant;
  },
  at(day, hours) {
    const instant = fromLocal(utcMidnight(day) + hours * HOUR);
    if (instant === null) throw new Error(`${day} ${hours}h does not exist in Europe/Madrid`);
    return instant;
  },
};

// ---------------------------------------------------------------------------------------------
// Randomness

/** mulberry32: the same generator `seededShuffle` uses, as a stream of floats in [0, 1). */
export const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/** FNV-1a, so an item's difficulty depends only on its id. */
const hash = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

// ---------------------------------------------------------------------------------------------
// Learner

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Learner {
  /** Whether the learner recalls the item on this card. */
  recalls(card: PlannedCard, state: SchedulerState | null, now: Timestamp): boolean;
  /** Rating chosen after a correct recall on a meaning card. */
  ratingOnRecall(): Rating;
}

export interface LearnerOptions {
  seed: number;
  /**
   * Items the learner keeps failing on scheduled meaning cards, with their recall probability, until
   * `until` if given.
   */
  failing?: { items: ReadonlySet<ItemId>; recall: number; until?: Timestamp };
  /** Fixed recall probabilities by card reason, over the defaults. */
  rates?: Partial<Record<CardReason, number>>;
}

export const difficultyOf = (itemId: ItemId): Difficulty => {
  const bucket = hash(itemId) % 10;
  return bucket < 3 ? 'easy' : bucket < 8 ? 'medium' : 'hard';
};

/** Exponent on retrievability: easy words are remembered better than FSRS predicts, hard ones worse. */
const EXPONENT: Record<Difficulty, number> = { easy: 0.6, medium: 1, hard: 1.6 };
/** Recall right after teaching, and on the first rating the next day. */
const JUST_TAUGHT: Record<Difficulty, number> = { easy: 0.95, medium: 0.88, hard: 0.75 };
const FIRST_RATING: Record<Difficulty, number> = { easy: 0.92, medium: 0.82, hard: 0.7 };

/**
 * Retrievability with the FSRS-4.5/5 power curve, R = 0.9 when elapsed equals stability. FSRS-7 has
 * its own curve; this approximation is enough to drive a learner whose memory decays with time.
 */
export const retrievability = (state: SchedulerState, now: Timestamp): number => {
  if (state.state === 'new') return 0;
  const elapsedDays = Math.max(0, now - state.lastReviewAt) / DAY;
  return (1 + (19 / 81) * (elapsedDays / Math.max(state.stability, 0.01))) ** -0.5;
};

export const createLearner = ({ seed, failing, rates }: LearnerOptions): Learner => {
  const draw = rng(seed);
  const probability = (card: PlannedCard, state: SchedulerState | null, now: Timestamp): number => {
    const level = difficultyOf(card.itemId);
    if (failing?.items.has(card.itemId) && card.intent === 'scheduled' && now < (failing.until ?? Infinity)) return failing.recall;
    const fixed = rates?.[card.reason];
    if (fixed !== undefined) return fixed;
    switch (card.reason) {
      case 'new-practice':
      case 'teach-again':
        return JUST_TAUGHT[level];
      case 'requeue':
        return 0.9;
      case 'first-rating':
        return FIRST_RATING[level];
      case 'learning-step':
        return 0.9;
      default:
        if (!state || state.state === 'new') return JUST_TAUGHT[level];
        return retrievability(state, now) ** EXPONENT[level];
    }
  };
  return {
    recalls: (card, state, now) => draw() < probability(card, state, now),
    ratingOnRecall: () => (draw() < 0.1 ? 'hard' : 'good'),
  };
};

// ---------------------------------------------------------------------------------------------
// Content the evaluator sees

const answer = { characters: '字', pinyin: 'zì', meaning: 'palabra' };

/** The rating task: characters shown, meaning recalled without options, then self-assessment. */
const MEANING: Exercise = {
  id: 'sim-meaning',
  skill: 'meaning',
  format: 'free-recall',
  grading: 'self-assessment',
  cue: 'characters',
  prompt: '¿Qué significa esta palabra?',
  options: [],
  context: null,
  audio: null,
  answer,
  rubric: { id: 'sim-meaning', revision: '1' },
};

/** Practice: the old `recognize` prompt, multiple choice graded automatically. It never rates. */
const RECOGNIZE: Exercise = {
  id: 'sim-recognize',
  skill: 'meaning',
  format: 'multiple-choice',
  grading: 'automatic',
  cue: 'characters',
  prompt: '¿Qué significa esta palabra?',
  options: [
    { id: 'right', text: 'palabra', contentId: null },
    { id: 'wrong', text: 'otra', contentId: null },
  ],
  context: null,
  audio: null,
  answer,
  rubric: { id: 'sim-recognize', revision: '1' },
};

const contentOf = (itemId: ItemId): ContentReference => ({ contentId: itemId.slice(itemId.indexOf(':') + 1), contentRevision: 'sim:1' });

export const wordIds = (count: number): ItemId[] =>
  Array.from({ length: count }, (_, i) => `word-meaning:sim-${String(i + 1).padStart(4, '0')}` as ItemId);

// ---------------------------------------------------------------------------------------------
// World

export interface SessionRecord {
  dayIndex: number;
  localDay: LocalDay;
  mode: SessionMode;
  scope: SessionScope;
  startedAt: Timestamp;
  endedAt: Timestamp;
  /** The final plan, requeues included. */
  plan: SessionPlan;
  /** Cards `buildSession` planned. */
  initialCards: number;
  /** Cards after every requeue. */
  finalCards: number;
  /** Cards `requeueAfterAgain` added. */
  added: number;
  /** In scope and pending today when the session started. */
  pendingAtStart: number;
  /** Pending today across the whole pool when the session started. */
  backlogAtStart: number;
  tomorrowLoadAtStart: number;
  scheduledWritten: number;
  practiceWritten: number;
  exposures: number;
  /** A `scheduled` card the evaluator turned into practice: plan and evaluator disagree. */
  scheduledNotRated: number;
  againCount: number;
}

/** One scheduled review the simulator wrote, with the state it replaced. */
export interface ReviewRecord {
  itemId: ItemId;
  mode: SessionMode;
  before: SchedulerState['state'];
  /** First local day the item was pending: the day of `dueAt`, or `eligibleFrom` for a first rating. */
  pendingFrom: LocalDay;
  reviewedOn: LocalDay;
  rating: Rating;
}

export interface PlannedSession {
  /** Local wall-clock hour the session starts at. */
  hour: number;
  mode: SessionMode;
  scope?: SessionScope;
}

export interface WorldOptions {
  scheduler: Scheduler;
  zone: Zone;
  items: readonly ItemId[];
  topics?: (itemId: ItemId) => readonly string[];
  learner: Learner;
  settings?: SessionSettings;
  shuffleSeed?: number;
  /** Seconds per card. */
  cardSeconds?: number;
}

export interface World {
  readonly zone: Zone;
  readonly scheduler: Scheduler;
  readonly settings: SessionSettings;
  readonly pool: readonly PoolItem[];
  readonly states: Map<ItemId, SchedulerState>;
  readonly events: LearningEvent[];
  readonly byItem: Map<ItemId, LearningEvent[]>;
  readonly sessions: SessionRecord[];
  readonly reviews: ReviewRecord[];
  /** Runs one session to the end. */
  runSession(dayIndex: number, day: LocalDay, planned: PlannedSession): SessionRecord;
  /** Items pending today at `now`, over the whole pool. */
  pendingAt(now: Timestamp): ItemId[];
  itemEvents(itemId: ItemId): LearningEvent[];
}

const DEVICE = 'sim-device';

/** The first local day `pendingToday` holds for the state, or null for a new item not yet eligible. */
export const pendingFrom = (state: SchedulerState, zone: LocalDayRule): LocalDay | null =>
  state.state === 'new' ? state.eligibleFrom : zone.localDay(state.dueAt);

/** Calendar days from `a` to `b`. Labels are calendar days, so UTC arithmetic on them is exact. */
export const daysBetween = (a: LocalDay, b: LocalDay): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export const createWorld = (options: WorldOptions): World => {
  const { scheduler, zone, learner } = options;
  const settings = options.settings ?? DEFAULT_SESSION_SETTINGS;
  const cardMs = (options.cardSeconds ?? 15) * 1000;
  const pool: PoolItem[] = options.items.map((itemId) => ({ itemId, available: true, topicIds: options.topics?.(itemId) }));
  const poolById = new Map(pool.map((item) => [item.itemId, item]));
  const states = new Map<ItemId, SchedulerState>();
  const events: LearningEvent[] = [];
  const byItem = new Map<ItemId, LearningEvent[]>();
  const sessions: SessionRecord[] = [];
  const reviews: ReviewRecord[] = [];
  const shuffleRoot = options.shuffleSeed ?? 1;
  let sequence = 0;

  const itemEvents = (itemId: ItemId) => byItem.get(itemId) ?? [];
  const push = (event: LearningEvent) => {
    events.push(event);
    const list = byItem.get(event.itemId);
    if (list) list.push(event);
    else byItem.set(event.itemId, [event]);
  };

  const pendingAt = (now: Timestamp) =>
    pool.flatMap(({ itemId }) => {
      const state = states.get(itemId);
      return state && pendingToday(state, now, zone) ? [itemId] : [];
    });

  const inScope = (scope: SessionScope, item: PoolItem) =>
    scope.kind === 'all' ? true : scope.kind === 'item' ? item.itemId === scope.itemId : (item.topicIds ?? []).some((t) => scope.topicIds.includes(t));

  /** After a teaching or a practice, a never-rated item may now have an `eligibleFrom`. */
  const refreshNew = (itemId: ItemId) => {
    const state = states.get(itemId);
    if (state && state.state !== 'new') return;
    const eligibleFrom = eligibleFromEvents(effectiveItemEvents(itemEvents(itemId), itemId));
    states.set(itemId, { ...scheduler.newState(itemId), eligibleFrom });
  };

  const runSession = (dayIndex: number, day: LocalDay, planned: PlannedSession): SessionRecord => {
    const scope = planned.scope ?? { kind: 'all' };
    const startedAt = zone.at(day, planned.hour);
    const sessionId = `s${dayIndex}-${sessions.length}`;
    let plan = buildSession({
      mode: planned.mode,
      scope,
      pool,
      states,
      events,
      now: startedAt,
      dayRule: zone,
      settings,
      shuffle: seededShuffle(shuffleRoot * 7919 + sessions.length),
    });
    const backlog = pendingAt(startedAt);
    const record: SessionRecord = {
      dayIndex,
      localDay: zone.localDay(startedAt),
      mode: planned.mode,
      scope,
      startedAt,
      endedAt: startedAt,
      plan,
      initialCards: plan.cards.length,
      finalCards: plan.cards.length,
      added: 0,
      pendingAtStart: backlog.filter((itemId) => inScope(scope, poolById.get(itemId)!)).length,
      backlogAtStart: backlog.length,
      tomorrowLoadAtStart: tomorrowLoad(states.values(), startedAt, zone),
      scheduledWritten: 0,
      practiceWritten: 0,
      exposures: 0,
      scheduledNotRated: 0,
      againCount: 0,
    };

    let clock = startedAt;
    const guard = settings.workLimit + settings.requeueLimit + 1;
    for (let position = 0; position < plan.cards.length; position++) {
      if (position >= guard) throw new Error(`Session ${sessionId} passed ${guard} cards`);
      const card = plan.cards[position];
      clock += cardMs;
      const eventId = `${sessionId}:${position}`;
      const base = {
        schemaVersion: 1 as const,
        id: eventId,
        sessionId,
        sessionMode: planned.mode,
        deviceId: DEVICE,
        sequence: sequence++,
        occurredAt: clock,
        localDay: zone.localDay(clock),
      };
      const content = contentOf(card.itemId);

      if (card.intent === 'teach') {
        push({ ...base, type: 'exposure', itemId: card.itemId, content, card: { id: `card-${eventId}`, reason: 'teaching', answer, audio: null } });
        record.exposures += 1;
        refreshNew(card.itemId);
        continue;
      }

      const state = states.get(card.itemId) ?? null;
      const recalled = learner.recalls(card, state, clock);
      // The rating task for scheduled cards and "Ya la sé" checks; practice is multiple choice.
      // Flojos keeps the rating task on purpose: the mode alone must stop it from rating.
      const usesMeaning = card.intent === 'scheduled' || card.intent === 'already-known-check' || planned.mode === 'weak';
      const exercise = usesMeaning ? MEANING : RECOGNIZE;
      const actions: AttemptAction[] = usesMeaning
        ? [
            { type: 'reveal', at: clock - 5000 },
            { type: 'self-assessment', at: clock, rating: recalled ? learner.ratingOnRecall() : 'again' },
          ]
        : [
            {
              type: 'answer',
              at: clock,
              answer: null,
              selectedOptionId: recalled ? 'right' : 'wrong',
              evaluation: { outcome: recalled ? 'correct' : 'incorrect' },
            },
          ];
      const result = evaluateAttempt({ id: `attempt-${eventId}`, itemId: card.itemId, actions }, exercise, {
        sessionMode: planned.mode,
        scheduledEligible: state !== null && pendingToday(state, clock, zone),
        alreadyKnownCheck: card.intent === 'already-known-check',
      });
      const attempt = {
        ...base,
        itemId: card.itemId,
        attemptId: `attempt-${eventId}`,
        content,
        exercise,
        evaluatorVersion: result.evaluatorVersion,
        actions,
        evidence: result.evidence,
      };

      let failed: boolean;
      if (result.kind === 'scheduled-review') {
        const next = scheduler.apply(state ?? scheduler.newState(card.itemId), result.rating, clock);
        // The writer stamps the review with the instant the scheduler used.
        push({ ...attempt, occurredAt: next.lastReviewAt, localDay: zone.localDay(next.lastReviewAt), type: 'scheduled-review', configId: scheduler.configId, basis: result.basis, rating: result.rating, evaluation: result.evaluation } as LearningEvent);
        const prior = state ?? scheduler.newState(card.itemId);
        reviews.push({
          itemId: card.itemId,
          mode: planned.mode,
          before: prior.state,
          pendingFrom: pendingFrom(prior, zone) ?? zone.localDay(clock),
          reviewedOn: zone.localDay(next.lastReviewAt),
          rating: result.rating,
        });
        states.set(card.itemId, next);
        record.scheduledWritten += 1;
        failed = result.rating === 'again';
      } else if (result.kind === 'practice') {
        push({ ...attempt, type: 'practice', evaluation: result.evaluation });
        record.practiceWritten += 1;
        if (card.intent === 'scheduled') record.scheduledNotRated += 1;
        refreshNew(card.itemId);
        failed = result.evaluation.outcome !== 'correct';
      } else {
        throw new Error(`Unexpected invalid attempt in ${eventId}`);
      }

      if (failed) {
        record.againCount += 1;
        const before = plan.cards.length;
        plan = requeueAfterAgain(plan, position, card.itemId);
        record.added += plan.cards.length - before;
      }
    }

    record.endedAt = clock;
    record.finalCards = plan.cards.length;
    record.plan = plan;
    sessions.push(record);
    return record;
  };

  return { zone, scheduler, settings, pool, states, events, byItem, sessions, reviews, runSession, pendingAt, itemEvents };
};

// ---------------------------------------------------------------------------------------------
// Running and reporting

export interface RunOptions {
  startDay: LocalDay;
  days: number;
  /** Sessions for a day index; an empty list skips the day. */
  sessionsFor(dayIndex: number, day: LocalDay): readonly PlannedSession[];
  /** Called after each day's sessions, for per-day checks. */
  afterDay?(dayIndex: number, day: LocalDay, sessions: readonly SessionRecord[]): void;
}

export const run = (world: World, options: RunOptions): void => {
  for (let dayIndex = 0; dayIndex < options.days; dayIndex++) {
    const day = addLocalDays(options.startDay, dayIndex);
    const today: SessionRecord[] = [];
    for (const planned of options.sessionsFor(dayIndex, day)) today.push(world.runSession(dayIndex, day, planned));
    options.afterDay?.(dayIndex, day, today);
  }
};

/** Distinct items whose first teaching exposure falls on each local day. */
export const firstTeachingsByDay = (world: World): Map<LocalDay, number> => {
  const out = new Map<LocalDay, number>();
  for (const [itemId, list] of world.byItem) {
    const first = effectiveItemEvents(list, itemId).find((event) => event.type === 'exposure' && event.card.reason === 'teaching');
    if (first) out.set(first.localDay, (out.get(first.localDay) ?? 0) + 1);
  }
  return out;
};

const short = (counts: Readonly<Record<LeftOutReason, number>>) =>
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${reason}=${n}`)
    .join(',');

/** One line per session, only with SIM_VERBOSE set. */
export const report = (title: string, world: World): void => {
  if (!process.env.SIM_VERBOSE) return;
  const lines = world.sessions.map((s) =>
    [
      `d${String(s.dayIndex).padStart(2, '0')} ${s.localDay} ${s.mode.padEnd(5)}`,
      `backlog=${String(s.backlogAtStart).padStart(3)} pend=${String(s.pendingAtStart).padStart(3)} load24h=${String(s.tomorrowLoadAtStart).padStart(3)}`,
      `cards=${String(s.initialCards).padStart(2)}+${s.added} sched=${s.scheduledWritten} new=${s.plan.counts.newItems} again=${s.againCount}`,
      short(s.plan.leftOutCounts),
    ].join(' | '),
  );
  console.log(`\n[${title}] ${world.zone.name}\n${lines.join('\n')}`);
};
