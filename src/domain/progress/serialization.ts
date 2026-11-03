import { isNonNegativeInteger, isRecord } from '../../utils/parse';
import type { ActivityByDevice, DayLog } from './activity';
import type { CharProgress, DailyLog, ProgressState } from './types';

const invalidCharacter = () => new Error('Hay datos de caracteres no válidos.');

const countField = (value: Record<string, unknown>, key: string): number => {
  if (!(key in value) || value[key] === undefined) return 0;
  const field = value[key];
  if (!isNonNegativeInteger(field)) throw invalidCharacter();
  return field;
};

const easeField = (value: Record<string, unknown>): number => {
  if (!('ease' in value) || value.ease === undefined) return 2.5;
  const field = value.ease;
  if (typeof field !== 'number' || !Number.isFinite(field) || field < 1.3) throw invalidCharacter();
  return field;
};

const strokeBestField = (value: Record<string, unknown>): number | null => {
  if (!('strokeBest' in value) || value.strokeBest === undefined || value.strokeBest === null) return null;
  const field = value.strokeBest;
  if (!isNonNegativeInteger(field)) throw invalidCharacter();
  return field;
};

const deviceIdField = (value: Record<string, unknown>): string => {
  if (!('deviceId' in value) || value.deviceId === undefined) return '';
  if (typeof value.deviceId !== 'string') throw invalidCharacter();
  return value.deviceId;
};

/** One character or word record. Throws when a field is not valid. */
export const parseRecord = (value: Record<string, unknown>): CharProgress => ({
  right: countField(value, 'right'),
  wrong: countField(value, 'wrong'),
  reps: countField(value, 'reps'),
  lapses: countField(value, 'lapses'),
  interval: countField(value, 'interval'),
  ease: easeField(value),
  due: countField(value, 'due'),
  strokeRuns: countField(value, 'strokeRuns'),
  strokeBest: strokeBestField(value),
  lastSeen: countField(value, 'lastSeen'),
  // A record with no counter: successful reviews since the last lapse are the same idea.
  clean: 'clean' in value && value.clean !== undefined ? countField(value, 'clean') : countField(value, 'reps'),
  // A record with no stamp loses to any stamped copy of it when two copies are merged.
  updatedAt: countField(value, 'updatedAt'),
  deviceId: deviceIdField(value),
});

export const parseDaily = (value: unknown): DailyLog => {
  if (!isRecord(value) || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)) {
    throw new Error('El registro diario no es válido.');
  }
  const date = new Date(`${value.day}T00:00:00Z`);
  const reviewed = value.reviewed;
  const introduced = value.introduced;
  const streak = value.streak;
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.day ||
    !isNonNegativeInteger(reviewed) || !isNonNegativeInteger(introduced) || !isNonNegativeInteger(streak)) {
    throw new Error('El registro diario no es válido.');
  }
  return { day: value.day, reviewed, introduced, streak };
};

const UNSAFE = ['__proto__', 'constructor', 'prototype'];

const parseRecords = (value: unknown, validId: (id: string) => boolean): Record<string, CharProgress> => {
  if (!isRecord(value)) throw new Error('La copia está incompleta.');
  const out: Record<string, CharProgress> = {};
  for (const [id, record] of Object.entries(value)) {
    if (!id || UNSAFE.includes(id) || !validId(id) || !isRecord(record)) throw invalidCharacter();
    out[id] = parseRecord(record);
  }
  return out;
};

/** The saved document and backup file, `version: 4`. Earlier versions had no users and are not read. */
export const parseProgress = (raw: string): ProgressState => {
  const saved: unknown = JSON.parse(raw);
  if (!isRecord(saved)) throw new Error('El archivo no contiene datos de progreso válidos.');
  if (saved.version !== 4) throw new Error('Esta versión de la copia no es compatible.');
  if (!('chars' in saved) || !('daily' in saved) || !('words' in saved) || !('wordDaily' in saved)) throw new Error('La copia está incompleta.');
  const chars = parseRecords(saved.chars, (char) => [...char].length === 1);
  const words = parseRecords(saved.words, () => true);
  return { chars, daily: parseDaily(saved.daily), words, wordDaily: parseDaily(saved.wordDaily), activity: parseActivity(saved.activity) };
};

/** A day log, keeping only well-formed days: the calendar is a convenience, not worth failing a copy over. */
export const parseDayLog = (value: unknown): DayLog => {
  const log: DayLog = {};
  if (!isRecord(value)) return log;
  for (const [day, count] of Object.entries(value)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && isNonNegativeInteger(count)) log[day] = count;
  }
  return log;
};

const parseActivity = (value: unknown): ActivityByDevice => {
  const byDevice: ActivityByDevice = {};
  if (!isRecord(value)) return byDevice;
  for (const [device, log] of Object.entries(value)) {
    if (UNSAFE.includes(device)) continue;
    byDevice[device] = parseDayLog(log);
  }
  return byDevice;
};
