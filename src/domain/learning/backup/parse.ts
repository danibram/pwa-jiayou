import {
  SESSION_MODE_RATES,
  type ConfigId,
  type ItemId,
  type LearningBackup,
  type LearningEvent,
  type LocalDay,
  type SessionMode,
  type StoredSchedulerConfig,
  type Timestamp,
} from '../types';
import { compareReplayOrder } from '../scheduler';
import { err, ok, type BackupError, type Result } from './errors';

// Runtime validation of a learning backup. The file comes from anywhere, so nothing here trusts the
// static types. Every field is checked, unknown keys are rejected and every output object is built
// field by field from parsed values, never by spreading the input.

const FAIL: unique symbol = Symbol('invalid');
type Parsed<T> = T | typeof FAIL;
type Parser<T> = (value: unknown, path: string, errors: BackupError[]) => Parsed<T>;

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const join = (path: string, key: string) => (path ? `${path}.${key}` : key);
const label = (path: string) => path || 'la copia';

const invalid = (errors: BackupError[], path: string, message: string): typeof FAIL => {
  errors.push({ code: 'invalid-format', path, message });
  return FAIL;
};

const check =
  <T>(test: (value: unknown) => boolean, expected: string): Parser<T> =>
  (value, path, errors) =>
    test(value) ? (value as T) : invalid(errors, path, `${label(path)} debe ser ${expected}`);

const string = check<string>((value) => typeof value === 'string', 'texto');
const id = check<string>((value) => typeof value === 'string' && value.length > 0, 'un texto no vacío');
const boolean = check<boolean>((value) => typeof value === 'boolean', 'verdadero o falso');
const finite = check<number>((value) => typeof value === 'number' && Number.isFinite(value), 'un número');
const count = check<number>((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'un entero no negativo');
/** Epoch ms. ts-fsrs rejects the epoch itself, so an event time must be after it. */
const instant = check<Timestamp>((value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0, 'una fecha en milisegundos');

const literal = <T extends string | number | boolean>(expected: T): Parser<T> =>
  check<T>((value) => value === expected, JSON.stringify(expected));

const oneOf = <T extends string>(options: readonly T[]): Parser<T> =>
  check<T>((value) => typeof value === 'string' && options.includes(value as T), `uno de ${options.join(', ')}`);

const nullable =
  <T>(parser: Parser<T>): Parser<T | null> =>
  (value, path, errors) =>
    value === null ? null : parser(value, path, errors);

const array =
  <T>(parser: Parser<T>): Parser<T[]> =>
  (value, path, errors) => {
    if (!Array.isArray(value)) return invalid(errors, path, `${label(path)} debe ser una lista`);
    const out: T[] = [];
    let failed = false;
    value.forEach((item, index) => {
      const parsed = parser(item, `${path}[${index}]`, errors);
      if (parsed === FAIL) failed = true;
      else out.push(parsed);
    });
    return failed ? FAIL : out;
  };

type Shape = Record<string, Parser<unknown>>;
type Out<S extends Shape> = { [K in keyof S]: S[K] extends Parser<infer T> ? T : never };

/** An object with exactly these keys, plus the optional ones when present. */
const object =
  <R extends Shape, O extends Shape = Record<never, Parser<unknown>>>(required: R, optional?: O): Parser<Out<R> & Partial<Out<O>>> =>
  (value, path, errors) => {
    if (!isRecord(value)) return invalid(errors, path, `${label(path)} debe ser un objeto`);
    let failed = false;
    for (const key of Object.keys(value)) {
      if (!hasOwn(required, key) && !(optional && hasOwn(optional, key))) {
        invalid(errors, join(path, key), `El campo ${join(path, key)} no forma parte del formato`);
        failed = true;
      }
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(required)) {
      if (!hasOwn(value, key)) {
        invalid(errors, join(path, key), `Falta el campo ${join(path, key)}`);
        failed = true;
        continue;
      }
      const parsed = required[key](value[key], join(path, key), errors);
      if (parsed === FAIL) failed = true;
      else out[key] = parsed;
    }
    for (const key of Object.keys(optional ?? {})) {
      if (!hasOwn(value, key)) continue;
      const parsed = optional![key](value[key], join(path, key), errors);
      if (parsed === FAIL) failed = true;
      else out[key] = parsed;
    }
    return failed ? FAIL : (out as Out<R> & Partial<Out<O>>);
  };

/** Picks the parser by the value of `tag`. */
const variant =
  <T>(tag: string, cases: Record<string, Parser<T>>): Parser<T> =>
  (value, path, errors) => {
    if (!isRecord(value)) return invalid(errors, path, `${label(path)} debe ser un objeto`);
    const kind = value[tag];
    if (!hasOwn(value, tag) || typeof kind !== 'string' || !hasOwn(cases, kind)) {
      return invalid(errors, join(path, tag), `${join(path, tag)} debe ser uno de ${Object.keys(cases).join(', ')}`);
    }
    return cases[kind](value, path, errors);
  };

// Domain formats.

const LOCAL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** "2026-11-05", and a real calendar day, so "2026-02-30" fails. */
export const isLocalDay = (value: unknown): value is LocalDay => {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DAY.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
};

const WORD_ITEM = /^word-meaning:\S+$/;
const CHARACTER_ITEM = /^character-writing:char-([0-9a-f]{1,6})$/;
/**
 * `word-meaning:` and a published word id, or `character-writing:char-` and a code point in hex as
 * `characterContentId` writes it, in lowercase, without leading zeros and never a lone surrogate.
 */
export const isItemId = (value: unknown): value is ItemId => {
  if (typeof value !== 'string') return false;
  if (WORD_ITEM.test(value)) return true;
  const match = CHARACTER_ITEM.exec(value);
  if (!match) return false;
  const point = parseInt(match[1], 16);
  return point.toString(16) === match[1] && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff);
};

const CONFIG_ID = /^scheduler-config:sha256:[0-9a-f]{64}$/;
export const isConfigId = (value: unknown): value is ConfigId => typeof value === 'string' && CONFIG_ID.test(value);

const localDay = check<LocalDay>(isLocalDay, 'un día como "2026-11-05"');
const itemId = check<ItemId>(isItemId, 'un id de elemento ("word-meaning:…" o "character-writing:char-…")');
const configIdField = check<ConfigId>(isConfigId, 'un id de configuración "scheduler-config:sha256:…"');

const SKILLS = ['meaning', 'production', 'listening', 'tones', 'writing', 'context'] as const;
const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
const SESSION_MODES = Object.keys(SESSION_MODE_RATES) as SessionMode[];

const validEvaluation = variant<unknown>('outcome', {
  correct: object({ outcome: literal('correct') }),
  partial: object({ outcome: literal('partial'), missing: array(string) }),
  incorrect: object({ outcome: literal('incorrect') }),
  unanswered: object({ outcome: literal('unanswered') }),
});
const invalidEvaluation = object({
  outcome: literal('invalid'),
  reason: oneOf(['technical-error', 'ambiguous-question', 'content-changed', 'other'] as const),
});
const evaluation = variant<unknown>('outcome', {
  correct: validEvaluation,
  partial: validEvaluation,
  incorrect: validEvaluation,
  unanswered: validEvaluation,
  invalid: invalidEvaluation,
});

const contentReference = object({ contentId: id, contentRevision: id });
const speechAudio = object({ source: literal('speech-synthesis'), hanzi: string, pinyin: string });
const revealedAnswer = object({ characters: string, pinyin: string, meaning: string });
const hint = object(
  { kind: oneOf(['pinyin', 'audio', 'length', 'answer', 'other'] as const), revealsAnswer: boolean },
  { value: string },
);

const exercise = object(
  {
    id,
    skill: oneOf(SKILLS),
    format: oneOf(['free-recall', 'multiple-choice', 'writing', 'other'] as const),
    grading: oneOf(['self-assessment', 'automatic'] as const),
    cue: oneOf(['characters', 'gloss', 'audio'] as const),
    prompt: string,
    options: array(object({ id, text: string }, { contentId: nullable(string) })),
    context: nullable(string),
    audio: nullable(speechAudio),
    answer: nullable(revealedAnswer),
    rubric: object({ id, revision: id }),
  },
  {
    stage: oneOf(['watch', 'trace', 'memory'] as const),
    accepted: array(object({ id, simplified: string, traditional: string, pinyin: string, glosses: array(string) })),
  },
);

const action = variant<unknown>('type', {
  answer: object({ type: literal('answer'), at: count, answer: nullable(string), selectedOptionId: nullable(string), evaluation }),
  hint: object({ type: literal('hint'), at: count, hint }),
  reveal: object({ type: literal('reveal'), at: count }),
  'self-assessment': object({ type: literal('self-assessment'), at: count, rating: oneOf(RATINGS) }),
  drawing: object({ type: literal('drawing'), at: count, mistakes: count, evaluation: validEvaluation }),
});

const evidence = object({
  id,
  skill: oneOf(SKILLS),
  recordedAt: count,
  evaluation: validEvaluation,
  assisted: boolean,
  confusions: array(object({ optionId: id, contentId: nullable(string) })),
  mistakes: nullable(count),
});

const eventBase = {
  schemaVersion: literal(1),
  id,
  sessionId: id,
  sessionMode: oneOf(SESSION_MODES),
  deviceId: id,
  sequence: count,
  occurredAt: instant,
  localDay,
};

const attemptBase = {
  ...eventBase,
  itemId,
  attemptId: id,
  content: contentReference,
  exercise,
  evaluatorVersion: id,
  actions: array(action),
  evidence: array(evidence),
};

const eventShape = variant<unknown>('type', {
  exposure: object({
    ...eventBase,
    type: literal('exposure'),
    itemId,
    content: contentReference,
    card: object({ id, reason: oneOf(['teaching', 'already-known'] as const), answer: revealedAnswer, audio: nullable(speechAudio) }),
  }),
  practice: object({ ...attemptBase, type: literal('practice'), evaluation: validEvaluation }),
  // Whether the rating fits the basis and the actions is the evaluator's rule, checked when planning.
  'scheduled-review': object({
    ...attemptBase,
    type: literal('scheduled-review'),
    configId: configIdField,
    basis: oneOf(['due', 'already-known'] as const),
    rating: oneOf(RATINGS),
    evaluation: validEvaluation,
  }),
  'invalid-attempt': object({ ...attemptBase, type: literal('invalid-attempt'), evaluation: invalidEvaluation }),
  'attempt-voided': object({
    ...eventBase,
    type: literal('attempt-voided'),
    itemId,
    targetEventId: id,
    reason: oneOf(['user-correction', 'content-error', 'technical-error', 'other'] as const),
  }),
});

/** An item id is its kind and its content id, so `word-meaning:` + the word's id. */
const itemMatchesContent = (event: LearningEvent): boolean =>
  !('content' in event) || event.itemId === `${event.itemId.slice(0, event.itemId.indexOf(':'))}:${event.content.contentId}`;

const event: Parser<LearningEvent> = (value, path, errors) => {
  const parsed = eventShape(value, path, errors);
  if (parsed === FAIL) return FAIL;
  const typed = parsed as LearningEvent;
  if (!itemMatchesContent(typed)) {
    errors.push({
      code: 'item-content-mismatch',
      path: join(path, 'itemId'),
      eventId: typed.id,
      message: `El evento ${typed.id} es de ${typed.itemId} pero cita el contenido ${'content' in typed ? typed.content.contentId : ''}`,
    });
    return FAIL;
  }
  return typed;
};

/**
 * Only the shape, meaning the type of each field. Whether the values make a config the adapter runs, its
 * package version and its hash are checked by `planMerge` and `planReplace`, which report each rule
 * with its own code.
 */
const schedulerConfig = object({
  algorithm: string,
  modelVersion: string,
  packageVersion: string,
  parameters: array(finite),
  desiredRetention: finite,
  maximumIntervalDays: finite,
  enableFuzz: boolean,
  enableShortTerm: boolean,
  learningSteps: array(string),
  relearningSteps: array(string),
  graduatingInterval: finite,
  fractionalDays: boolean,
  clearStatsOnForget: boolean,
  allowModelOverride: boolean,
});

const storedConfig = object({ id: configIdField, config: schedulerConfig }) as unknown as Parser<StoredSchedulerConfig>;

const backupShape = object({
  schemaVersion: literal(1),
  exportedAt: instant,
  deviceId: id,
  events: array(event),
  configs: array(storedConfig),
});

/** Validates an already-decoded value, as the combined format nests one. `path` prefixes error paths. */
export const parseBackupValue = (value: unknown, path = ''): Result<LearningBackup, BackupError[]> => {
  if (isRecord(value) && hasOwn(value, 'schemaVersion') && value.schemaVersion !== 1) {
    return err([
      {
        code: 'unsupported-version',
        path: join(path, 'schemaVersion'),
        message: `Esta copia usa la versión ${JSON.stringify(value.schemaVersion)} del formato y solo se lee la 1.`,
      },
    ]);
  }
  const errors: BackupError[] = [];
  const parsed = backupShape(value, path, errors);
  return parsed === FAIL ? err(errors) : ok(parsed as LearningBackup);
};

/** Decodes and validates a backup file. A file with any error is rejected whole. */
export const parseBackup = (raw: string): Result<LearningBackup, BackupError[]> => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return err([{ code: 'invalid-json', message: 'El archivo no es JSON válido.' }]);
  }
  return parseBackupValue(value);
};

/** A backup of a log, events in replay order and configs by id so equal logs give equal files. */
export const createBackup = (input: {
  deviceId: string;
  exportedAt: Timestamp;
  events: readonly LearningEvent[];
  configs: readonly StoredSchedulerConfig[];
}): LearningBackup => ({
  schemaVersion: 1,
  exportedAt: input.exportedAt,
  deviceId: input.deviceId,
  events: [...input.events].sort(compareReplayOrder),
  configs: [...input.configs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
});

export const serializeBackup = (backup: LearningBackup): string => JSON.stringify(backup);
