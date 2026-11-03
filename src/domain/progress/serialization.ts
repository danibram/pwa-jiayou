import { isNonNegativeInteger, isRecord } from '../../utils/parse';
import type { CharProgress, DailyLog, ProgressState } from './types';

const emptyDaily = (): DailyLog => ({ day: new Date().toLocaleDateString('sv-SE'), reviewed: 0, introduced: 0, streak: 0 });

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
  // Older saves have no counter. Successful reviews since the last lapse are the same idea.
  clean: 'clean' in value && value.clean !== undefined ? countField(value, 'clean') : countField(value, 'reps'),
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

/** Accepts legacy character maps and the current versioned backup format. */
export const parseProgress = (raw: string): ProgressState => {
  const saved: unknown = JSON.parse(raw);
  if (!isRecord(saved)) throw new Error('El archivo no contiene datos de progreso válidos.');
  if ('version' in saved && saved.version !== 2 && saved.version !== 3) throw new Error('Esta versión de la copia no es compatible.');
  const chars = 'chars' in saved ? saved.chars : saved;
  if (!isRecord(chars)) throw new Error('La lista de caracteres no es válida.');
  const migrated: Record<string, CharProgress> = {};
  for (const [char, value] of Object.entries(chars)) {
    if (!('chars' in saved) && char === 'daily') continue;
    if (!char || !isRecord(value) || [...char].length !== 1 || ['__proto__', 'constructor', 'prototype'].includes(char)) {
      throw invalidCharacter();
    }
    migrated[char] = parseRecord(value);
  }
  const daily = 'daily' in saved ? parseDaily(saved.daily) : emptyDaily();
  if (saved.version === 2 && (!('chars' in saved) || !('daily' in saved))) throw new Error('La copia está incompleta.');
  const words: Record<string, CharProgress> = {};
  if (saved.version === 3) {
    if (!isRecord(saved.words) || !('wordDaily' in saved) || !('chars' in saved) || !('daily' in saved)) throw new Error('La copia está incompleta.');
    for (const [id, value] of Object.entries(saved.words)) {
      if (!id || ['__proto__', 'constructor', 'prototype'].includes(id) || !isRecord(value)) throw invalidCharacter();
      words[id] = parseRecord(value);
    }
  }
  const wordDaily = saved.version === 3 ? parseDaily(saved.wordDaily) : emptyDaily();
  // Optional: saves from before the calendar have none.
  const activity: Record<string, number> = {};
  if (isRecord(saved.activity)) {
    for (const [day, count] of Object.entries(saved.activity)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && isNonNegativeInteger(count)) activity[day] = count;
    }
  }
  return { chars: migrated, daily, words, wordDaily, activity };
};

