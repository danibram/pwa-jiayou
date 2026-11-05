import { effectiveItemEvents, isWeak, pendingToday, tomorrowLoadFull } from '../scheduler/index.ts';
import { SESSION_MODE_RATES, STUDY_RULES, type ItemId, type LearningEvent, type LocalDay, type SchedulerState } from '../types.ts';
import { summarize } from './counts.ts';
import type {
  CardReason,
  ItemKind,
  LeftOutReason,
  PlannedCard,
  PoolItem,
  SessionInput,
  SessionPlan,
} from './types.ts';
import { itemKind } from '../items.ts';

const GROUP = 3;

/** What the policy knows about one item in scope. */
interface Candidate {
  item: PoolItem;
  state: SchedulerState | null;
  events: readonly LearningEvent[];
  /** Has a teaching exposure, on any day. */
  taught: boolean;
  /** Has any exposure or a scheduled state: the learner has met it. */
  seen: boolean;
}

const groupByItem = (events: readonly LearningEvent[]): Map<ItemId, LearningEvent[]> => {
  const out = new Map<ItemId, LearningEvent[]>();
  for (const event of events) {
    const list = out.get(event.itemId);
    if (list) list.push(event);
    else out.set(event.itemId, [event]);
  }
  return out;
};

/** The local day of the item's first teaching exposure, in replay order. */
const firstTeachingDay = (ordered: readonly LearningEvent[]): LocalDay | null => {
  const first = ordered.find((event) => event.type === 'exposure' && event.card.reason === 'teaching');
  return first ? first.localDay : null;
};

/** Balanced groups of about three: ten items are 3, 4 and 3. */
const groupsOf = <T>(items: readonly T[]): T[][] => {
  if (items.length === 0) return [];
  const count = Math.max(1, Math.round(items.length / GROUP));
  return Array.from({ length: count }, (_, index) =>
    items.slice(Math.round((index * items.length) / count), Math.round(((index + 1) * items.length) / count)));
};

/**
 * The order a group of just-taught items is asked in: never opening on the item shown last, and from
 * three items up never in the order taught. Without a shuffle, a rotation by one.
 */
const askOrder = <T>(taught: readonly T[], shuffle?: <U>(items: readonly U[]) => U[]): T[] => {
  const bad = (order: readonly T[]) =>
    (taught.length > 1 && order[0] === taught[taught.length - 1]) ||
    (taught.length > 2 && order.every((item, index) => item === taught[index]));
  const rotated = taught.length > 2 ? [...taught.slice(1), taught[0]] : [...taught];
  if (!shuffle) return rotated;
  for (let tries = 0; tries < 20; tries++) {
    const order = shuffle(taught);
    if (!bad(order)) return order;
  }
  return rotated;
};

/**
 * A few reviews, then a group of new items and their practice, and again. A long session never opens
 * with all its introductions.
 */
const interleave = (
  reviews: readonly PlannedCard[],
  teachings: readonly { itemId: ItemId; reason: CardReason }[],
  shuffle?: <T>(items: readonly T[]) => T[],
): PlannedCard[] => {
  const out: PlannedCard[] = [];
  const groups = groupsOf(teachings);
  let r = 0;
  for (const group of groups) {
    out.push(...reviews.slice(r, r + GROUP));
    r += GROUP;
    out.push(...group.map(({ itemId, reason }) => ({ itemId, intent: 'teach' as const, reason })));
    out.push(...askOrder(group.map(({ itemId }) => itemId), shuffle).map((itemId) => ({ itemId, intent: 'practice' as const, reason: 'new-practice' as const })));
  }
  out.push(...reviews.slice(r));
  return out;
};

const scheduledReason = (state: SchedulerState): CardReason =>
  state.state === 'new' ? 'first-rating' : state.state === 'review' ? 'due-review' : 'learning-step';

/**
 * Steps first, by due time; then reviews, most overdue first; then first ratings, oldest eligibility
 * first. A full session leaves out first ratings before it leaves out an overdue review.
 */
const scheduledOrder = (a: Candidate, b: Candidate): number => {
  const rank = (state: SchedulerState) => (state.state === 'learning' || state.state === 'relearning' ? 0 : state.state === 'review' ? 1 : 2);
  const sa = a.state as SchedulerState;
  const sb = b.state as SchedulerState;
  const byRank = rank(sa) - rank(sb);
  if (byRank !== 0) return byRank;
  if (sa.state === 'new' && sb.state === 'new') return (sa.eligibleFrom ?? '') < (sb.eligibleFrom ?? '') ? -1 : (sa.eligibleFrom ?? '') > (sb.eligibleFrom ?? '') ? 1 : 0;
  if (sa.state !== 'new' && sb.state !== 'new') return sa.dueAt - sb.dueAt;
  return 0;
};

const LEFT_OUT_REASONS: readonly LeftOutReason[] = [
  'content-unavailable',
  'not-in-pool',
  'work-limit',
  'new-budget-day',
  'new-budget-session',
  'tomorrow-load',
  'pending-elsewhere',
  'practice-limit',
];

/**
 * Plans one session. Priority: learning and relearning steps that have come due, due reviews and first
 * ratings, then new items within the budgets, then practice. Pure: equal input gives an equal plan.
 */
export const buildSession = (input: SessionInput): SessionPlan => {
  const { mode, scope, pool, states, now, dayRule, settings, shuffle } = input;
  const today = dayRule.localDay(now);
  const kind: ItemKind = mode === 'strokes' ? 'character-writing' : 'word-meaning';
  const rates = SESSION_MODE_RATES[mode];
  const byItem = groupByItem(input.events);
  const ordered = (itemId: ItemId) => effectiveItemEvents(byItem.get(itemId) ?? [], itemId);

  const leftOut: { itemId: ItemId; reason: LeftOutReason }[] = [];
  const leave = (itemId: ItemId, reason: LeftOutReason) => leftOut.push({ itemId, reason });

  // Budgets count every item of the kind taught today, retired ones too: the exposure happened.
  let taughtToday = 0;
  for (const itemId of byItem.keys()) if (itemKind(itemId) === kind && firstTeachingDay(ordered(itemId)) === today) taughtToday += 1;
  const dayCap = mode === 'today' ? Math.min(settings.todayNewPerDay[kind], settings.newPerDay[kind]) : settings.newPerDay[kind];

  const kindPool = pool.filter((item) => itemKind(item.itemId) === kind);
  const loadFull = tomorrowLoadFull(
    kindPool.flatMap((item) => {
      const state = states.get(item.itemId);
      return state ? [state] : [];
    }),
    now,
    dayRule,
  );

  let scoped: PoolItem[];
  if (scope.kind === 'all') scoped = kindPool;
  else if (scope.kind === 'topics') {
    const wanted = new Set(scope.topicIds);
    scoped = kindPool.filter((item) => item.topicIds?.some((id) => wanted.has(id)));
  } else {
    scoped = kindPool.filter((item) => item.itemId === scope.itemId);
    if (scoped.length === 0) leave(scope.itemId, 'not-in-pool');
  }

  const candidates: Candidate[] = [];
  for (const item of scoped) {
    if (!item.available) {
      leave(item.itemId, 'content-unavailable');
      continue;
    }
    const events = ordered(item.itemId);
    const state = states.get(item.itemId) ?? null;
    const taught = events.some((event) => event.type === 'exposure' && event.card.reason === 'teaching');
    const seen = (state !== null && state.state !== 'new') || events.some((event) => event.type === 'exposure');
    candidates.push({ item, state, events, taught, seen });
  }

  const isPending = (c: Candidate) => c.state !== null && pendingToday(c.state, now, dayRule);
  const weak = (c: Candidate) => c.seen && isWeak(c.events, c.item.itemId, today);
  const practiceOrder = (list: Candidate[]) => (shuffle ? shuffle(list) : list);

  const reviews: PlannedCard[] = [];
  const teachings: { itemId: ItemId; reason: CardReason }[] = [];
  let newItems = 0;
  /** Units the plan has spent so far. */
  let used = 0;
  const room = () => settings.workLimit - used;

  const takeScheduled = (list: Candidate[]) => {
    for (const c of [...list].sort(scheduledOrder)) {
      if (room() < 1) {
        leave(c.item.itemId, 'work-limit');
        continue;
      }
      reviews.push({ itemId: c.item.itemId, intent: 'scheduled', reason: scheduledReason(c.state as SchedulerState) });
      used += 1;
    }
  };

  const takePractice = (list: Candidate[], reason: CardReason) => {
    let taken = 0;
    for (const c of practiceOrder(list)) {
      if (taken >= settings.practiceLimit || room() < 1) {
        leave(c.item.itemId, 'practice-limit');
        continue;
      }
      reviews.push({ itemId: c.item.itemId, intent: 'practice', reason });
      used += 1;
      taken += 1;
    }
  };

  /** Free reteaches, then budget-spending new items, in pool order. */
  const takeNew = (list: Candidate[]) => {
    let pairs = 0;
    const reteach = list.filter((c) => c.taught);
    const fresh = list.filter((c) => !c.taught);
    for (const c of reteach) {
      if (pairs >= settings.newPerSession || room() < 2) {
        leave(c.item.itemId, 'new-budget-session');
        continue;
      }
      teachings.push({ itemId: c.item.itemId, reason: 'reteach' });
      used += 2;
      pairs += 1;
    }
    for (const c of fresh) {
      let reason: LeftOutReason | null = null;
      if (taughtToday + newItems >= dayCap) reason = 'new-budget-day';
      else if (loadFull) reason = 'tomorrow-load';
      else if (pairs >= settings.newPerSession || room() < 2) reason = 'new-budget-session';
      if (reason) {
        leave(c.item.itemId, reason);
        continue;
      }
      teachings.push({ itemId: c.item.itemId, reason: 'new' });
      used += 2;
      pairs += 1;
      newItems += 1;
    }
  };

  switch (mode) {
    case 'weak':
      takePractice(candidates.filter(weak), 'weak');
      break;
    case 'review-all': {
      const met = candidates.filter((c) => c.seen);
      const pending = met.filter(isPending);
      takeScheduled(pending);
      // Weak items first among the rest, so a short practice still reaches them.
      const rest = met.filter((c) => !isPending(c));
      takePractice([...rest.filter(weak), ...rest.filter((c) => !weak(c))], 'seen');
      break;
    }
    case 'word':
      // An explicit choice: no budget, load or room check, but a first teaching still counts as one.
      for (const c of candidates) {
        if (rates && isPending(c)) reviews.push({ itemId: c.item.itemId, intent: 'scheduled', reason: scheduledReason(c.state as SchedulerState) });
        else if (c.state !== null && c.state.state === 'new' && c.state.eligibleFrom !== null) reviews.push({ itemId: c.item.itemId, intent: 'practice', reason: 'chosen' });
        else if (c.state === null || c.state.state === 'new') {
          teachings.push({ itemId: c.item.itemId, reason: c.taught ? 'reteach' : 'new' });
          if (!c.taught) newItems += 1;
        } else reviews.push({ itemId: c.item.itemId, intent: 'practice', reason: 'chosen' });
      }
      break;
    default: {
      // today, more-words, topic, strokes.
      const pending = candidates.filter(isPending);
      takeScheduled(pending);
      // New: never rated and not waiting for tomorrow's first rating.
      const unrated = candidates.filter((c) => !isPending(c) && (c.state === null || (c.state.state === 'new' && c.state.eligibleFrom === null)));
      // A topic or Más palabras teaches nothing while a pending item stays out of this plan: the
      // learner should clear those first (old `canLearnMore`). Hoy has no room left in that case anyway.
      const scheduledHere = new Set(reviews.map((card) => card.itemId));
      const blocksNew = mode === 'topic' || mode === 'more-words' || scope.kind === 'topics';
      const pendingOutside = blocksNew && kindPool.some((item) => {
        const state = states.get(item.itemId);
        return item.available && state !== undefined && !scheduledHere.has(item.itemId) && pendingToday(state, now, dayRule);
      });
      if (pendingOutside) for (const c of unrated) leave(c.item.itemId, 'pending-elsewhere');
      else takeNew(unrated);
      // A scoped session goes on with practice of what the learner has met; Hoy and Más palabras stop.
      if (scope.kind !== 'all') {
        const rest = candidates.filter((c) => c.seen && !isPending(c) && !unrated.includes(c));
        takePractice([...rest.filter(weak), ...rest.filter((c) => !weak(c))], 'seen');
      }
    }
  }

  const cards = interleave(reviews, teachings, shuffle);
  const leftOutCounts = Object.fromEntries(LEFT_OUT_REASONS.map((reason) => [reason, 0])) as Record<LeftOutReason, number>;
  for (const { reason } of leftOut) leftOutCounts[reason] += 1;

  return {
    mode,
    today,
    cards,
    counts: {
      ...summarize(cards),
      newItems,
      taughtToday,
      newLeftAfter: Math.max(0, dayCap - taughtToday - newItems),
      tomorrowLoadFull: loadFull,
    },
    leftOut,
    leftOutCounts,
    limits: { requeueGap: STUDY_RULES.requeueGap, requeueLimit: settings.requeueLimit, requeuesPerItem: settings.requeuesPerItem },
  };
};
