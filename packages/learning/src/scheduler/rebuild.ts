import {
  REPLAY_ORDER,
  type ConfigId,
  type ItemId,
  type LearningEvent,
  type LocalDay,
  type SchedulerState,
  type StoredSchedulerConfig,
  type VoidableEventType,
} from '../types.ts';
import { canonicalJson } from './configId.ts';
import { createScheduler, InvalidSchedulerConfigError, type Scheduler } from './fsrs.ts';
import { addLocalDays } from './localDay.ts';

/** Every config the log cites, created at startup so a rebuild never awaits. */
export type SchedulerRegistry = ReadonlyMap<ConfigId, Scheduler>;

/**
 * A log no correct writer produces: two attempt events for one attempt, one id with two contents, or a
 * scheduled review citing a config the registry lacks. Rebuilding stops rather than guess.
 */
export class CorruptLogError extends Error {
  override name = 'CorruptLogError';
  constructor(
    readonly reason: 'duplicate-attempt' | 'conflicting-event' | 'unknown-config',
    message: string,
  ) {
    super(message);
  }
}

/** Creates one scheduler per stored config, after checking each id is its config's own hash. */
export const createSchedulerRegistry = async (stored: readonly StoredSchedulerConfig[]): Promise<SchedulerRegistry> => {
  const registry = new Map<ConfigId, Scheduler>();
  for (const { id, config } of stored) {
    const known = registry.get(id);
    if (known) {
      if (canonicalJson(known.config) !== canonicalJson(config)) throw new InvalidSchedulerConfigError(`Two configs stored as ${id}`);
      continue;
    }
    const scheduler = await createScheduler(config);
    if (scheduler.configId !== id) throw new InvalidSchedulerConfigError(`Config stored as ${id} hashes to ${scheduler.configId}`);
    registry.set(id, scheduler);
  }
  return registry;
};

type Ordered = Pick<LearningEvent, (typeof REPLAY_ORDER)[number]>;

/** `REPLAY_ORDER`, ascending. `<` compares numbers as numbers and strings by code unit. */
export const compareReplayOrder = (a: Ordered, b: Ordered): number => {
  for (const key of REPLAY_ORDER) {
    const x = a[key];
    const y = b[key];
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
};

const VOIDABLE: ReadonlySet<LearningEvent['type']> = new Set<VoidableEventType>(['practice', 'scheduled-review', 'invalid-attempt']);

/** Throws if two attempt events share an attempt id with different ids, voided or not. */
export const assertNoDuplicateAttempts = (events: readonly LearningEvent[]): void => {
  const byAttempt = new Map<string, string>();
  for (const event of events) {
    if (!('attemptId' in event)) continue;
    const seen = byAttempt.get(event.attemptId);
    if (seen === undefined) byAttempt.set(event.attemptId, event.id);
    else if (seen !== event.id) {
      throw new CorruptLogError('duplicate-attempt', `Attempt ${event.attemptId} has two events: ${seen} and ${event.id}`);
    }
  }
};

/** One copy per id. The same id with another content is corruption, not a later write. */
const uniqueById = (events: readonly LearningEvent[]): LearningEvent[] => {
  const byId = new Map<string, LearningEvent>();
  for (const event of events) {
    const seen = byId.get(event.id);
    // Only a collision pays for the canonical form.
    if (!seen) byId.set(event.id, event);
    else if (seen !== event && canonicalJson(seen) !== canonicalJson(event)) {
      throw new CorruptLogError('conflicting-event', `Event ${event.id} appears with two contents`);
    }
  }
  return [...byId.values()];
};

/**
 * The item's events that still count, in replay order: duplicates collapsed, voided attempts and the
 * voids themselves removed. Throws `CorruptLogError` on a duplicate attempt anywhere in `events`.
 */
export const effectiveItemEvents = (events: readonly LearningEvent[], itemId: ItemId): LearningEvent[] => {
  const unique = uniqueById(events);
  assertNoDuplicateAttempts(unique);
  const own = unique.filter((event) => event.itemId === itemId);
  const voided = new Set(own.flatMap((event) => (event.type === 'attempt-voided' ? [event.targetEventId] : [])));
  return own
    .filter((event) => event.type !== 'attempt-voided' && !(VOIDABLE.has(event.type) && voided.has(event.id)))
    .sort(compareReplayOrder);
};

/**
 * A practice that shows the learner recalled the item alone: correct, with no hint that gave the
 * answer away before the first answer (any hint, for writing). Decision P1 waits for one.
 */
export const passesPractice = (event: { type: string; evaluation?: { outcome: string }; evidence?: readonly { assisted: boolean }[] }): boolean =>
  event.type === 'practice' && event.evaluation?.outcome === 'correct' && (event.evidence ?? []).every((evidence) => !evidence.assisted);

/**
 * Decision P1: the local day after the first unassisted correct practice that follows the first
 * teaching exposure, or null while there is none. Takes events already in replay order.
 */
export const eligibleFromEvents = (ordered: readonly LearningEvent[]): LocalDay | null => {
  const taught = ordered.findIndex((event) => event.type === 'exposure' && event.card.reason === 'teaching');
  if (taught < 0) return null;
  const passed = ordered.slice(taught + 1).find((event) => passesPractice(event));
  return passed ? addLocalDays(passed.localDay, 1) : null;
};

/**
 * Rebuilds one item's cache from the log. Every non-voided scheduled review is applied with its own
 * config, including reviews a merge turned into early ones. `scheduler` is the current config: a
 * new item cites it, and it resolves reviews whose config is missing from `configs`.
 */
export const rebuildItem = (
  events: readonly LearningEvent[],
  itemId: ItemId,
  scheduler: Scheduler,
  configs: SchedulerRegistry,
): SchedulerState => {
  const ordered = effectiveItemEvents(events, itemId);
  let state: SchedulerState = { ...scheduler.newState(itemId), eligibleFrom: eligibleFromEvents(ordered) };
  for (const event of ordered) {
    if (event.type !== 'scheduled-review') continue;
    const reviewer = configs.get(event.configId) ?? (event.configId === scheduler.configId ? scheduler : undefined);
    if (!reviewer) throw new CorruptLogError('unknown-config', `Review ${event.id} cites unknown config ${event.configId}`);
    state = reviewer.apply(state, event.rating, event.occurredAt);
  }
  return state;
};
