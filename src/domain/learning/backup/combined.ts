import type { ActivityByDevice } from '../../progress/activity';
import { parseDaily, parseDayLog, parseRecord } from '../../progress/serialization';
import type { CharProgress, DailyLog } from '../../progress/types';
import type { LearningBackup } from '../types';
import { err, ok, type BackupError, type Result } from './errors';
import { parseBackupValue } from './parse';

// The file the backup screen reads and writes until phase 5C retires the old character progress. It
// carries the learning log and the v4 character records side by side. Vocabulary progress from v4 is
// not carried, because words start over in the event log and there are no users to migrate.

/** The character half of a v4 progress document. `activity` is the calendar of every device. */
export interface LegacyCharacterProgress {
  version: 4;
  chars: Record<string, CharProgress>;
  daily: DailyLog;
  activity: ActivityByDevice;
}

export interface CombinedBackup {
  learning: LearningBackup;
  legacyCharacters: LegacyCharacterProgress;
}

export interface BackupWarning {
  code: 'legacy-vocabulary-ignored';
  message: string;
  /** Word records left out. */
  count: number;
}

/** What a chosen file holds. A v4 file or a bare learning backup is accepted alongside the combined one. */
export type UserBackup =
  | { source: 'combined'; learning: LearningBackup; legacyCharacters: LegacyCharacterProgress; warnings: BackupWarning[] }
  | { source: 'learning'; learning: LearningBackup; legacyCharacters: null; warnings: BackupWarning[] }
  | { source: 'legacy-v4'; learning: null; legacyCharacters: LegacyCharacterProgress; warnings: BackupWarning[] };

const UNSAFE = ['__proto__', 'constructor', 'prototype'];
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const join = (path: string, key: string) => (path ? `${path}.${key}` : key);
const formatError = (path: string, message: string): BackupError => ({ code: 'invalid-format', path, message });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Character records keyed by the character itself, checked the way `parseProgress` checks them. */
const parseChars = (value: unknown, path: string, errors: BackupError[]): Record<string, CharProgress> => {
  const chars: Record<string, CharProgress> = {};
  if (!isRecord(value)) {
    errors.push(formatError(path, `${path} debe ser un objeto`));
    return chars;
  }
  for (const [char, record] of Object.entries(value)) {
    const at = join(path, char);
    if (UNSAFE.includes(char) || [...char].length !== 1 || !isRecord(record)) {
      errors.push(formatError(at, `${at} no es un registro de carácter válido`));
      continue;
    }
    try {
      chars[char] = parseRecord(record);
    } catch (error) {
      errors.push(formatError(at, messageOf(error)));
    }
  }
  return chars;
};

/** Days with a malformed count are dropped, as `parseProgress` does, since the calendar is a convenience. */
const parseActivity = (value: unknown): ActivityByDevice => {
  const byDevice: ActivityByDevice = {};
  if (!isRecord(value)) return byDevice;
  for (const [device, log] of Object.entries(value)) {
    if (!UNSAFE.includes(device)) byDevice[device] = parseDayLog(log);
  }
  return byDevice;
};

const parseLegacyFields = (value: Record<string, unknown>, path: string, errors: BackupError[]): LegacyCharacterProgress | null => {
  const before = errors.length;
  for (const key of ['chars', 'daily']) {
    if (!hasOwn(value, key)) errors.push(formatError(join(path, key), `Falta el campo ${join(path, key)}`));
  }
  if (errors.length > before) return null;
  const chars = parseChars(value.chars, join(path, 'chars'), errors);
  let daily: DailyLog | null = null;
  try {
    daily = parseDaily(value.daily);
  } catch (error) {
    errors.push(formatError(join(path, 'daily'), messageOf(error)));
  }
  if (errors.length > before || !daily) return null;
  return { version: 4, chars, daily, activity: parseActivity(value.activity) };
};

/** The `legacyCharacters` part of a combined file. It has exactly four fields and no vocabulary. */
const parseLegacyCharacters = (value: unknown, path: string, errors: BackupError[]): LegacyCharacterProgress | null => {
  if (!isRecord(value)) {
    errors.push(formatError(path, `${path} debe ser un objeto`));
    return null;
  }
  const before = errors.length;
  if (value.version !== 4) errors.push(formatError(join(path, 'version'), `${join(path, 'version')} debe ser 4`));
  for (const key of Object.keys(value)) {
    if (!['version', 'chars', 'daily', 'activity'].includes(key)) {
      errors.push(formatError(join(path, key), `El campo ${join(path, key)} no forma parte del formato`));
    }
  }
  if (!hasOwn(value, 'activity')) errors.push(formatError(join(path, 'activity'), `Falta el campo ${join(path, 'activity')}`));
  const parsed = parseLegacyFields(value, path, errors);
  return errors.length > before ? null : parsed;
};

/**
 * A v4 progress file, as `progressStore.exportBackup` writes it. Only characters, their daily log and
 * the activity calendar are kept; word records are left out with a warning. Like `parseProgress`, it
 * ignores keys it does not know, such as the `myWords` list of older files.
 */
const parseLegacyDocument = (value: Record<string, unknown>): Result<{ legacyCharacters: LegacyCharacterProgress; warnings: BackupWarning[] }, BackupError[]> => {
  const errors: BackupError[] = [];
  const legacyCharacters = parseLegacyFields(value, '', errors);
  if (!legacyCharacters) return err(errors);
  const words = isRecord(value.words) ? Object.keys(value.words).length : 0;
  const warnings: BackupWarning[] =
    words > 0
      ? [
          {
            code: 'legacy-vocabulary-ignored',
            count: words,
            message: `La copia trae progreso antiguo de ${words} ${words === 1 ? 'palabra' : 'palabras'}, que no se importa. Las palabras empiezan de cero con el nuevo sistema.`,
          },
        ]
      : [];
  return ok({ legacyCharacters, warnings });
};

const decode = (raw: string): Result<unknown, BackupError[]> => {
  try {
    return ok(JSON.parse(raw) as unknown);
  } catch {
    return err([{ code: 'invalid-json', message: 'El archivo no es JSON válido.' }]);
  }
};

/** Reads a v4 progress file, for a legacy-only import and for the character half of an export. */
export const parseLegacyProgressFile = (raw: string): Result<{ legacyCharacters: LegacyCharacterProgress; warnings: BackupWarning[] }, BackupError[]> => {
  const decoded = decode(raw);
  if (!decoded.ok) return decoded;
  const value = decoded.value;
  if (!isRecord(value)) return err([formatError('', 'El archivo no contiene datos de progreso válidos.')]);
  if (value.version !== 4) {
    return err([{ code: 'unsupported-version', path: 'version', message: 'Esta versión de la copia no es compatible.' }]);
  }
  return parseLegacyDocument(value);
};

/**
 * Reads any file the backup screen accepts. That is the combined format, a learning backup alone, or a
 * v4 progress file. A file with any error is rejected whole; warnings never reject.
 */
export const parseUserBackup = (raw: string): Result<UserBackup, BackupError[]> => {
  const decoded = decode(raw);
  if (!decoded.ok) return decoded;
  const value = decoded.value;
  if (!isRecord(value)) return err([formatError('', 'El archivo no contiene una copia de progreso.')]);

  if (hasOwn(value, 'learning') || hasOwn(value, 'legacyCharacters')) {
    const errors: BackupError[] = [];
    for (const key of Object.keys(value)) {
      if (key !== 'learning' && key !== 'legacyCharacters') errors.push(formatError(key, `El campo ${key} no forma parte del formato`));
    }
    for (const key of ['learning', 'legacyCharacters']) {
      if (!hasOwn(value, key)) errors.push(formatError(key, `Falta el campo ${key}`));
    }
    const learning = hasOwn(value, 'learning') ? parseBackupValue(value.learning, 'learning') : null;
    if (learning && !learning.ok) errors.push(...learning.error);
    const legacyCharacters = hasOwn(value, 'legacyCharacters') ? parseLegacyCharacters(value.legacyCharacters, 'legacyCharacters', errors) : null;
    if (errors.length > 0 || !learning?.ok || !legacyCharacters) return err(errors);
    return ok({ source: 'combined', learning: learning.value, legacyCharacters, warnings: [] });
  }

  if (hasOwn(value, 'version')) {
    if (value.version !== 4) return err([{ code: 'unsupported-version', path: 'version', message: 'Esta versión de la copia no es compatible.' }]);
    const legacy = parseLegacyDocument(value);
    if (!legacy.ok) return legacy;
    return ok({ source: 'legacy-v4', learning: null, legacyCharacters: legacy.value.legacyCharacters, warnings: legacy.value.warnings });
  }

  if (hasOwn(value, 'schemaVersion')) {
    const learning = parseBackupValue(value);
    if (!learning.ok) return learning;
    return ok({ source: 'learning', learning: learning.value, legacyCharacters: null, warnings: [] });
  }

  return err([formatError('', 'El archivo no contiene una copia de progreso.')]);
};

export const serializeCombinedBackup = (backup: CombinedBackup): string =>
  JSON.stringify({ learning: backup.learning, legacyCharacters: backup.legacyCharacters });

/**
 * A v4 document that `progressStore.importBackup` and `mergeBackup` accept. `parseProgress` needs
 * the word fields, so they go in empty. A merge keeps the current word records and a replace drops them.
 */
export const legacyCharactersToProgressFile = (legacy: LegacyCharacterProgress): string =>
  JSON.stringify({
    version: 4,
    chars: legacy.chars,
    daily: legacy.daily,
    words: {},
    wordDaily: { day: legacy.daily.day, reviewed: 0, introduced: 0, streak: 0 },
    activity: legacy.activity,
  });
