import { DEFAULT_SESSION_SETTINGS, type PoolItem, type SessionInput } from '../../../src/domain/learning/sessions';
import type { ConfigId, ItemId, LocalDay, SchedulerState, Timestamp } from '../../../src/domain/learning/types';
import { DAY, utcRule } from '../scheduler/fixtures';

export { DAY, utcRule };
export const HOUR = 3_600_000;
export const CONFIG = 'scheduler-config:sha256:sessions-test' as ConfigId;

/** 2026-11-05 09:00 UTC. Every test speaks of this morning and the days around it. */
export const NOW: Timestamp = Date.UTC(2026, 10, 5, 9);
export const TODAY: LocalDay = '2026-11-05';
export const YESTERDAY: LocalDay = '2026-11-04';
export const TOMORROW: LocalDay = '2026-11-06';
/** 2026-11-05 at `hour` UTC, or another day with `days`. */
export const on = (hour: number, days = 0): Timestamp => Date.UTC(2026, 10, 5 + days, hour);

export const word = (n: number): ItemId => `word-meaning:w${String(n).padStart(3, '0')}`;
export const char = (hex: string): ItemId => `character-writing:char-${hex}`;
export const words = (from: number, count: number): ItemId[] => Array.from({ length: count }, (_, i) => word(from + i));

export const reviewed = (itemId: ItemId, dueAt: Timestamp, state: 'review' | 'learning' | 'relearning' = 'review'): SchedulerState => ({
  schemaVersion: 1,
  itemId,
  configId: CONFIG,
  state,
  dueAt,
  lastReviewAt: dueAt - 3 * DAY,
  stability: 4,
  stabilityFast: 4,
  difficulty: 5,
  scheduledDays: 3,
  reps: 3,
  lapses: 0,
  learningStep: 0,
});

export const fresh = (itemId: ItemId, eligibleFrom: LocalDay | null = null): SchedulerState => ({
  schemaVersion: 1,
  itemId,
  configId: CONFIG,
  state: 'new',
  eligibleFrom,
});

export const poolOf = (ids: readonly ItemId[], extra: Partial<PoolItem> = {}): PoolItem[] =>
  ids.map((itemId) => ({ itemId, available: true, ...extra }));

export const statesOf = (...states: SchedulerState[]): Map<ItemId, SchedulerState> => new Map(states.map((state) => [state.itemId, state]));

export const input = (overrides: Partial<SessionInput>): SessionInput => ({
  mode: 'today',
  scope: { kind: 'all' },
  pool: [],
  states: new Map(),
  events: [],
  now: NOW,
  dayRule: utcRule,
  settings: DEFAULT_SESSION_SETTINGS,
  ...overrides,
});
