import { validateAttemptEvent } from '../evaluation/index.ts';
import {
  canonicalJson,
  compareReplayOrder,
  configId as computeConfigId,
  INSTALLED_TS_FSRS_VERSION,
  InvalidSchedulerConfigError,
  validateSchedulerConfig,
} from '../scheduler/index.ts';
import type { ConfigId, ItemId, LearningEvent, StoredSchedulerConfig, VoidableEventType } from '../types.ts';
import { err, ok, type BackupError, type Result } from './errors.ts';

// Planning an import is a pure check over two logs, with no storage. The persistence layer writes what a plan
// returns, all of it in one transaction, or nothing when the plan is an error.

/** Events and configs, as the repository exports them or a parsed backup carries them. */
export interface LearningLog {
  events: readonly LearningEvent[];
  configs: readonly StoredSchedulerConfig[];
}

export interface MergePlan {
  /** The union by id, in replay order. */
  events: LearningEvent[];
  /** Events `current` lacks, in replay order. These are the ones to write. */
  newEvents: LearningEvent[];
  /** The union by id, sorted by id. */
  configs: StoredSchedulerConfig[];
  /** Configs `current` lacks. These are the ones to write. */
  newConfigs: StoredSchedulerConfig[];
  /** Items with at least one new event, voids included, sorted by code unit. */
  itemsToRebuild: ItemId[];
}

export interface ReplacePlan {
  /** In replay order. */
  events: LearningEvent[];
  /** Sorted by id. */
  configs: StoredSchedulerConfig[];
  /** Every item in the log, sorted by code unit. */
  itemsToRebuild: ItemId[];
}

const VOIDABLE: ReadonlySet<string> = new Set<VoidableEventType>(['practice', 'scheduled-review', 'invalid-attempt']);
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Adds events by id; the same id with another content is an error, the same content is ignored. */
const addEvents = (byId: Map<string, LearningEvent>, events: readonly LearningEvent[], errors: BackupError[]) => {
  const canonical = new Map<string, string>();
  const canonicalOf = (event: LearningEvent) => {
    let text = canonical.get(event.id);
    if (text === undefined) canonical.set(event.id, (text = canonicalJson(byId.get(event.id))));
    return text;
  };
  for (const event of events) {
    const seen = byId.get(event.id);
    if (!seen) byId.set(event.id, event);
    else if (seen !== event && canonicalOf(seen) !== canonicalJson(event)) {
      errors.push({ code: 'conflicting-event', eventId: event.id, message: `El evento ${event.id} aparece con dos contenidos distintos.` });
    }
  }
};

const addConfigs = (byId: Map<ConfigId, StoredSchedulerConfig>, configs: readonly StoredSchedulerConfig[], errors: BackupError[]) => {
  for (const stored of configs) {
    const seen = byId.get(stored.id);
    if (!seen) byId.set(stored.id, stored);
    else if (canonicalJson(seen.config) !== canonicalJson(stored.config)) {
      errors.push({ code: 'conflicting-config', configId: stored.id, message: `La configuración ${stored.id} aparece con dos contenidos distintos.` });
    }
  }
};

/** Package version first, so that rule has its own code; then the adapter's rules; then the hash. */
const checkConfig = async ({ id, config }: StoredSchedulerConfig, errors: BackupError[]) => {
  if (config.packageVersion !== INSTALLED_TS_FSRS_VERSION) {
    errors.push({
      code: 'package-version',
      configId: id,
      message: `La configuración ${id} es para ts-fsrs ${String(config.packageVersion)} y la instalada es ${INSTALLED_TS_FSRS_VERSION}.`,
    });
    return;
  }
  try {
    validateSchedulerConfig(config);
  } catch (error) {
    if (!(error instanceof InvalidSchedulerConfigError)) throw error;
    errors.push({ code: 'invalid-config', configId: id, message: `La configuración ${id} no es válida: ${error.message}` });
    return;
  }
  const hash = await computeConfigId(config);
  if (hash !== id) {
    errors.push({ code: 'config-hash-mismatch', configId: id, message: `La configuración guardada como ${id} corresponde a ${hash}.` });
  }
};

/** Rules over the whole union, covering one event per attempt, review configs and voids. */
const checkUnion = (events: readonly LearningEvent[], configs: ReadonlyMap<ConfigId, StoredSchedulerConfig>, errors: BackupError[]) => {
  const byId = new Map(events.map((event) => [event.id, event]));
  const byAttempt = new Map<string, string>();
  for (const event of events) {
    if ('attemptId' in event) {
      const seen = byAttempt.get(event.attemptId);
      if (seen === undefined) byAttempt.set(event.attemptId, event.id);
      else if (seen !== event.id) {
        errors.push({
          code: 'duplicate-attempt',
          eventId: event.id,
          message: `El intento ${event.attemptId} tiene dos eventos: ${seen} y ${event.id}.`,
        });
      }
    }
    if (event.type === 'scheduled-review' && !configs.has(event.configId)) {
      errors.push({ code: 'unknown-config', eventId: event.id, configId: event.configId, message: `El repaso ${event.id} cita la configuración desconocida ${event.configId}.` });
    }
    if (event.type === 'attempt-voided') {
      const target = byId.get(event.targetEventId);
      if (!target) {
        errors.push({ code: 'void-target-missing', eventId: event.id, message: `La anulación ${event.id} apunta a ${event.targetEventId}, que no está en el registro.` });
      } else if (!VOIDABLE.has(target.type)) {
        errors.push({ code: 'void-target-not-voidable', eventId: event.id, message: `La anulación ${event.id} apunta a un evento ${target.type}, que no se puede anular.` });
      } else if (target.itemId !== event.itemId) {
        errors.push({ code: 'void-item-mismatch', eventId: event.id, message: `La anulación ${event.id} es de ${event.itemId} y su objetivo de ${target.itemId}.` });
      }
    }
  }
};

const checkAttempts = (events: Iterable<LearningEvent>, errors: BackupError[]) => {
  for (const event of events) {
    for (const problem of validateAttemptEvent(event)) {
      errors.push({ code: 'invalid-attempt-event', eventId: problem.eventId, attemptCode: problem.code, message: `El evento ${problem.eventId} no cumple las reglas de evaluación: ${problem.message}` });
    }
  }
};

const itemsOf = (events: readonly LearningEvent[]): ItemId[] => [...new Set(events.map((event) => event.itemId))].sort(byCodeUnit);

/**
 * Plans importing `incoming` into `current` by union of events. The result is the same, up to
 * `newEvents`, `newConfigs` and `itemsToRebuild`, whichever side is `current`, and merging a log with
 * itself adds nothing.
 *
 * Evaluator rules and config hashes are checked on `incoming` only: `current` passed them when it was
 * written. Duplicate attempts, config references and voids are checked on the union, because a pair
 * can break them when neither side does alone. Any error rejects the whole plan.
 */
export const planMerge = async (current: LearningLog, incoming: LearningLog): Promise<Result<MergePlan, BackupError[]>> => {
  const errors: BackupError[] = [];

  const incomingById = new Map<string, LearningEvent>();
  addEvents(incomingById, incoming.events, errors);
  const union = new Map<string, LearningEvent>();
  addEvents(union, current.events, errors);
  const currentIds = new Set(union.keys());
  addEvents(union, [...incomingById.values()], errors);

  const incomingConfigs = new Map<ConfigId, StoredSchedulerConfig>();
  addConfigs(incomingConfigs, incoming.configs, errors);
  const configs = new Map<ConfigId, StoredSchedulerConfig>();
  addConfigs(configs, current.configs, errors);
  const currentConfigIds = new Set(configs.keys());
  addConfigs(configs, [...incomingConfigs.values()], errors);
  for (const stored of incomingConfigs.values()) await checkConfig(stored, errors);

  const events = [...union.values()].sort(compareReplayOrder);
  checkUnion(events, configs, errors);
  checkAttempts(incomingById.values(), errors);
  if (errors.length > 0) return err(errors);

  const newEvents = events.filter((event) => !currentIds.has(event.id));
  return ok({
    events,
    newEvents,
    configs: [...configs.values()].sort((a, b) => byCodeUnit(a.id, b.id)),
    newConfigs: [...incomingConfigs.values()].filter((stored) => !currentConfigIds.has(stored.id)).sort((a, b) => byCodeUnit(a.id, b.id)),
    itemsToRebuild: itemsOf(newEvents),
  });
};

/** Plans replacing the whole log with `incoming`, with the same checks as a merge into an empty log. */
export const planReplace = async (incoming: LearningLog): Promise<Result<ReplacePlan, BackupError[]>> => {
  const planned = await planMerge({ events: [], configs: [] }, incoming);
  if (!planned.ok) return planned;
  const { events, configs } = planned.value;
  return ok({ events, configs, itemsToRebuild: itemsOf(events) });
};

/**
 * The highest `sequence` this device wrote in `events`, or -1 without any. After a replace the device
 * moves its counter past it, so a restored copy never makes it reuse a number.
 */
export const highestSequence = (events: readonly LearningEvent[], deviceId: string): number =>
  events.reduce((highest, event) => (event.deviceId === deviceId && event.sequence > highest ? event.sequence : highest), -1);
