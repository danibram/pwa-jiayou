import { isNonNegativeInteger, isRecord } from '../../utils/parse';
import { parseDaily, parseRecord } from './serialization';
import type { CharProgress, DailyLog, ProgressState } from './types';

/** The two kinds of progress record. A session can touch both: words, and characters met in them. */
export type RecordKind = 'chars' | 'words';

/**
 * What a session needs to undo itself: each record it changed, as it was before the first change
 * (null when it did not exist), plus the day counters. Records the session never touched are left
 * out, so discarding it cannot undo a change made elsewhere, and a paused session stays small.
 */
export interface ProgressCheckpoint {
  daily: DailyLog;
  wordDaily: DailyLog;
  activity: Record<string, number>;
  chars: Record<string, CharProgress | null>;
  words: Record<string, CharProgress | null>;
}

const has = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key);

export const openCheckpoint = (state: ProgressState): ProgressCheckpoint => ({
  daily: { ...state.daily },
  wordDaily: { ...state.wordDaily },
  activity: { ...state.activity },
  chars: {},
  words: {},
});

/** Keeps the value a record had before its first change since `checkpoint` opened. */
export const noteBefore = (checkpoint: ProgressCheckpoint, kind: RecordKind, id: string, before: CharProgress | undefined) => {
  if (!has(checkpoint[kind], id)) checkpoint[kind][id] = before ? { ...before } : null;
};

const restoreRecords = (current: Record<string, CharProgress>, saved: Record<string, CharProgress | null>) => {
  const next = { ...current };
  for (const [id, before] of Object.entries(saved)) {
    if (before) next[id] = before;
    else delete next[id];
  }
  return next;
};

/** `state` with the checkpoint's records and day counters put back, and every other record as it is. */
export const restoreCheckpoint = (state: ProgressState, checkpoint: ProgressCheckpoint): ProgressState => ({
  chars: restoreRecords(state.chars, checkpoint.chars),
  words: restoreRecords(state.words, checkpoint.words),
  daily: checkpoint.daily,
  wordDaily: checkpoint.wordDaily,
  activity: checkpoint.activity,
});

const UNSAFE = ['__proto__', 'constructor', 'prototype'];

const parseSaved = (value: unknown): Record<string, CharProgress | null> => {
  if (!isRecord(value)) throw new Error('Invalid checkpoint');
  const out: Record<string, CharProgress | null> = {};
  for (const [id, before] of Object.entries(value)) {
    if (!id || UNSAFE.includes(id)) throw new Error('Invalid checkpoint');
    if (before === null) out[id] = null;
    else if (isRecord(before)) out[id] = parseRecord(before);
    else throw new Error('Invalid checkpoint');
  }
  return out;
};

/** A checkpoint read back from a paused session. Throws when any part of it is not valid. */
export const parseCheckpoint = (value: unknown): ProgressCheckpoint => {
  if (!isRecord(value) || !isRecord(value.activity)) throw new Error('Invalid checkpoint');
  const activity: Record<string, number> = {};
  for (const [day, count] of Object.entries(value.activity)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isNonNegativeInteger(count)) throw new Error('Invalid checkpoint');
    activity[day] = count;
  }
  return {
    daily: parseDaily(value.daily),
    wordDaily: parseDaily(value.wordDaily),
    activity,
    chars: parseSaved(value.chars),
    words: parseSaved(value.words),
  };
};
