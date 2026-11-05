import { DefaultScheduler, Rating as FsrsRating, State, type DefaultSchedulerCard, type Grade } from 'ts-fsrs';
import type { ConfigId, FsrsState, ItemId, Rating, SchedulerConfig, SchedulerState, Timestamp } from '../types.ts';
import { configId as computeConfigId } from './configId.ts';

/**
 * The ts-fsrs version this bundle ships. A test compares it with node_modules/ts-fsrs/package.json,
 * so bumping the dependency without a new config fails the suite.
 */
export const INSTALLED_TS_FSRS_VERSION = '6.0.0';

/** FSRS-7 takes exactly this many weights; FSRS-6 weights do not convert. */
export const FSRS7_PARAMETER_COUNT = 34;

/**
 * The starting config: ts-fsrs 6.0.0 defaults for FSRS-7 with a 0.9 target retention, pinned here so
 * its config id does not move if a later package changes a default.
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  algorithm: 'fsrs',
  modelVersion: 'FSRS-7',
  packageVersion: '6.0.0',
  parameters: [
    0.1104, 2.2395, 3.9221, 11.7841, 6.1686, 0.6457, 3.6807, 1.9795, 0, 1.3826, 0.7024, 0.5999, 0.8146, 0.6398, 1, 1.3207, 0.6707,
    3.8668, 0.4416, 0.0934, 1.8631, 0.6162, 1.0869, 0.1567, 0.0801, 0.2421, 0.9464, 0.1433, 0.7145, 0, 0.5667, 0.3734, 0.5333, 0.3048,
  ],
  desiredRetention: 0.9,
  maximumIntervalDays: 36500,
  enableFuzz: false,
  enableShortTerm: true,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
  graduatingInterval: 1,
  fractionalDays: true,
  clearStatsOnForget: true,
  allowModelOverride: true,
};

export type NewSchedulerState = Extract<SchedulerState, { state: 'new' }>;
export type ReviewedSchedulerState = Exclude<SchedulerState, NewSchedulerState>;

/** A config the adapter cannot run: wrong package or model, fuzz on, or malformed values. */
export class InvalidSchedulerConfigError extends Error {
  override name = 'InvalidSchedulerConfigError';
}

/** One FSRS config, ready to use. Everything after `createScheduler` is synchronous. */
export interface Scheduler {
  readonly config: SchedulerConfig;
  readonly configId: ConfigId;
  /** A word or character with no scheduled review yet. `configId` defaults to this scheduler's. */
  newState(itemId: ItemId, configId?: ConfigId): NewSchedulerState;
  /**
   * Applies one rating with this config. An instant before `lastReviewAt` is moved up to it, and the
   * result's `lastReviewAt` is the instant actually used: write it as the event's `occurredAt`.
   * The result cites this scheduler's `configId`, whatever config the input state cited.
   */
  apply(state: SchedulerState, rating: Rating, now: Timestamp): ReviewedSchedulerState;
}

const STEP_UNIT = /^\d+(\.\d+)?[mhd]$/;

const fail = (message: string): never => {
  throw new InvalidSchedulerConfigError(message);
};

/** Checks a config read from storage or a backup, where the types promise nothing. */
export const validateSchedulerConfig = (config: SchedulerConfig): void => {
  if (!config || typeof config !== 'object') fail('Scheduler config must be an object');
  if (config.algorithm !== 'fsrs') fail(`Unsupported algorithm "${String(config.algorithm)}"`);
  if (config.modelVersion !== 'FSRS-7') fail(`Unsupported model "${String(config.modelVersion)}"`);
  if (config.packageVersion !== INSTALLED_TS_FSRS_VERSION) {
    fail(`Config is for ts-fsrs ${String(config.packageVersion)}, installed is ${INSTALLED_TS_FSRS_VERSION}`);
  }
  if (!Array.isArray(config.parameters) || config.parameters.length !== FSRS7_PARAMETER_COUNT) {
    fail(`FSRS-7 needs ${FSRS7_PARAMETER_COUNT} parameters, got ${Array.isArray(config.parameters) ? config.parameters.length : 'none'}`);
  }
  if (!config.parameters.every((value) => typeof value === 'number' && Number.isFinite(value))) fail('Parameters must be finite numbers');
  if (config.enableFuzz !== false) fail('enableFuzz must stay off: replay and merge depend on it');
  if (config.fractionalDays !== true) fail('FSRS-7 always uses fractional days');
  if (!(typeof config.desiredRetention === 'number' && config.desiredRetention > 0 && config.desiredRetention < 1)) {
    fail('desiredRetention must be between 0 and 1');
  }
  if (!(Number.isInteger(config.maximumIntervalDays) && config.maximumIntervalDays > 0)) fail('maximumIntervalDays must be a positive integer');
  if (!(typeof config.graduatingInterval === 'number' && config.graduatingInterval > 0)) fail('graduatingInterval must be positive');
  for (const key of ['learningSteps', 'relearningSteps'] as const) {
    const steps: unknown = config[key];
    if (!Array.isArray(steps) || !steps.every((step) => typeof step === 'string' && STEP_UNIT.test(step))) {
      fail(`${key} must be steps like "10m", "1h" or "1d"`);
    }
  }
  for (const key of ['enableShortTerm', 'clearStatsOnForget', 'allowModelOverride'] as const) {
    if (typeof config[key] !== 'boolean') fail(`${key} must be a boolean`);
  }
};

const GRADES: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

const TO_STATE: Record<Exclude<FsrsState, 'new'>, State> = {
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const FROM_STATE: Partial<Record<State, Exclude<FsrsState, 'new'>>> = {
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

/** With the default middlewares the library's status is a function of `state`. */
const scheduleStatusOf = (state: Exclude<FsrsState, 'new'>) => (state === 'review' ? 'review' : 'learning');

/** Engines disagree in the last digits of the solver's interval, so it is stored rounded. */
const roundScheduledDays = (days: number) => Math.round(days * 1e6) / 1e6;

const toCard = (state: ReviewedSchedulerState): DefaultSchedulerCard => ({
  cardId: state.itemId,
  state: TO_STATE[state.state],
  scheduleStatus: scheduleStatusOf(state.state),
  dueAt: new Date(state.dueAt),
  lastReviewAt: new Date(state.lastReviewAt),
  stability: state.stability,
  stabilityFast: state.stabilityFast,
  difficulty: state.difficulty,
  scheduledDays: state.scheduledDays,
  reps: state.reps,
  lapses: state.lapses,
  learningStep: state.learningStep,
});

const fromCard = (card: DefaultSchedulerCard, itemId: ItemId, id: ConfigId): ReviewedSchedulerState => {
  const state = FROM_STATE[card.state];
  if (!state || !card.lastReviewAt) throw new Error(`ts-fsrs returned an unreviewed card for ${itemId}`);
  return {
    schemaVersion: 1,
    itemId,
    configId: id,
    state,
    dueAt: card.dueAt.getTime(),
    lastReviewAt: card.lastReviewAt.getTime(),
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    scheduledDays: roundScheduledDays(card.scheduledDays),
    reps: card.reps,
    lapses: card.lapses,
    learningStep: card.learningStep,
  };
};

/** ts-fsrs rejects the epoch itself as a date, so a zero is as invalid as NaN here. */
const assertTimestamp = (now: Timestamp) => {
  if (!Number.isFinite(now) || now <= 0) throw new RangeError(`Invalid review time ${now}`);
};

/**
 * Validates the config and loads FSRS-7. Call it once at startup, inside an async function: the model
 * loads with a dynamic import, and a top-level await in the entry module deadlocks (fsrs-probe.md).
 */
export const createScheduler = async (config: SchedulerConfig): Promise<Scheduler> => {
  validateSchedulerConfig(config);
  const own: SchedulerConfig = { ...config, parameters: [...config.parameters], learningSteps: [...config.learningSteps], relearningSteps: [...config.relearningSteps] };
  const [id, fsrs] = await Promise.all([
    computeConfigId(own),
    DefaultScheduler({
      version: own.modelVersion,
      weights: own.parameters,
      desiredRetention: own.desiredRetention,
      maximumInterval: own.maximumIntervalDays,
      enableFuzz: own.enableFuzz,
      enableShortTerm: own.enableShortTerm,
      learningSteps: own.learningSteps,
      relearningSteps: own.relearningSteps,
      graduatingInterval: own.graduatingInterval,
      clearStatsOnForget: own.clearStatsOnForget,
      allowModelOverride: own.allowModelOverride,
    }).catch((error: unknown) => fail(`ts-fsrs rejected the config: ${error instanceof Error ? error.message : String(error)}`)),
  ]);
  return {
    config: own,
    configId: id,
    newState: (itemId, citedConfig = id) => ({ schemaVersion: 1, itemId, configId: citedConfig, state: 'new', eligibleFrom: null }),
    apply(state, rating, now) {
      assertTimestamp(now);
      const at = state.state === 'new' ? now : Math.max(now, state.lastReviewAt);
      // A fresh Date per call: ts-fsrs keeps the object it receives as lastReviewAt.
      const card = state.state === 'new' ? fsrs.newCard({ now: new Date(at), cardId: state.itemId }) : toCard(state);
      return fromCard(fsrs.review({ card, grade: GRADES[rating], now: new Date(at) }).card, state.itemId, id);
    },
  };
};
