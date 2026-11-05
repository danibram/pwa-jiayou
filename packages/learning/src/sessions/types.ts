import type { LocalDayRule } from '../scheduler/index.ts';
import type { ItemId, LearningEvent, LocalDay, SchedulerState, SessionMode, Timestamp } from '../types.ts';

export type { CardIntent, CardReason } from '../types.ts';
import type { CardIntent, CardReason } from '../types.ts';

export interface PlannedCard {
  itemId: ItemId;
  intent: CardIntent;
  reason: CardReason;
}

import type { ItemKind } from '../items.ts';

export type { ItemKind };

/** An item of the active pool. The caller resolves content; the policy never imports `src/data`. */
export interface PoolItem {
  itemId: ItemId;
  /** False when the content is retired or its pack is not downloaded. */
  available: boolean;
  /** Topics the item belongs to, for a topic scope. */
  topicIds?: readonly string[];
}

export type { SessionScope } from '../types.ts';
import type { SessionScope } from '../types.ts';

export interface SessionSettings {
  /** Hard cap on items taught for the first time per local day, by kind. */
  newPerDay: Record<ItemKind, number>;
  /** Hoy's own share of `newPerDay`; Más palabras, topics and Trazos reach the rest. */
  todayNewPerDay: Record<ItemKind, number>;
  /** New items one session may introduce. */
  newPerSession: number;
  /** Cards a session starts with: every card is one unit, so a new item costs two. */
  workLimit: number;
  /** Practice cards a session starts with, inside `workLimit`. */
  practiceLimit: number;
  /** Cards `requeueAfterAgain` may add to one session. A reteach adds two. */
  requeueLimit: number;
  /** Requeues and reteaches for one item in one session. */
  requeuesPerItem: number;
}

export interface SessionInput {
  mode: SessionMode;
  scope: SessionScope;
  /** Every active item, in learning order: new items are taught in this order. */
  pool: readonly PoolItem[];
  /** Cached scheduler state by item. A missing item is new and never taught. */
  states: ReadonlyMap<ItemId, SchedulerState>;
  /** The whole learning log. A slice for the pool undercounts the budget by items retired after being taught today. */
  events: readonly LearningEvent[];
  now: Timestamp;
  /** Today is `dayRule.localDay(now)`; `pendingToday` also needs the next midnight. */
  dayRule: LocalDayRule;
  settings: SessionSettings;
  /**
   * A seeded shuffle for practice order and for the order new items are asked in. Without one the
   * plan keeps pool order and rotates each group of new items.
   */
  shuffle?: <T>(items: readonly T[]) => T[];
}

export type LeftOutReason =
  /** Its content is retired or not downloaded. */
  | 'content-unavailable'
  /** The single-word scope names an item outside the pool. */
  | 'not-in-pool'
  /** Pending, but the session is full. A later session picks it up. */
  | 'work-limit'
  /** New, but today's new-item budget is spent. */
  | 'new-budget-day'
  /** New, but this session already introduces `newPerSession` items or has no room for the pair. */
  | 'new-budget-session'
  /** New, but tomorrow's load reached `STUDY_RULES.tomorrowLoadLimit`. */
  | 'tomorrow-load'
  /** New, but a pending item is not in this topic or Más palabras plan. Those come first. */
  | 'pending-elsewhere'
  /** Practice candidate beyond `practiceLimit` or the room left. */
  | 'practice-limit';

/**
 * Informational. `requeueAfterAgain` and `markAlreadyKnown` keep the card totals right, but a
 * teach-again pair after a failed "Ya la sé" does not take back the budget; the next `buildSession`
 * recomputes budgets from the events.
 */
export interface SessionCounts {
  /** Cards in the plan; equal to `cards.length`. */
  cards: number;
  scheduled: number;
  teach: number;
  practice: number;
  alreadyKnownCheck: number;
  /** Items this plan teaches for the first time, which spend the budget. */
  newItems: number;
  /** Items taught today before this plan, by the first-teaching rule. */
  taughtToday: number;
  /** Budget left after this plan, for the mode (Hoy's share for `today`). */
  newLeftAfter: number;
  tomorrowLoadFull: boolean;
}

export interface SessionPlan {
  mode: SessionMode;
  today: LocalDay;
  cards: readonly PlannedCard[];
  counts: SessionCounts;
  leftOut: readonly { itemId: ItemId; reason: LeftOutReason }[];
  leftOutCounts: Readonly<Record<LeftOutReason, number>>;
  /** Copied from settings so `requeueAfterAgain` needs only the plan. */
  limits: { requeueGap: number; requeueLimit: number; requeuesPerItem: number };
}
