import type { ActivityByDevice, DayLog } from '../progress/activity';
import type { DailyLog, ProgressState } from '../progress/types';
import { canonicalJson as canonical } from '../learning/scheduler/configId';

/** A record that can be merged: its last write's time and device. */
export interface Stamped {
  updatedAt: number;
  deviceId: string;
}

/**
 * The copy that wins: the later write, then the larger device id. Two writes with the same time and
 * device should not differ, but a hand-edited file could; comparing the content keeps the result the
 * same in whichever order the copies arrive.
 */
const winner = <T extends Stamped>(a: T, b: T): T => {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (a.deviceId !== b.deviceId) return a.deviceId > b.deviceId ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
};

/** Last write wins, record by record. A record only one side has is kept. */
export const mergeRecords = <T extends Stamped>(a: Record<string, T>, b: Record<string, T>): Record<string, T> => {
  const out: Record<string, T> = { ...a };
  for (const [id, record] of Object.entries(b)) out[id] = Object.prototype.hasOwnProperty.call(out, id) ? winner(out[id], record) : record;
  return out;
};

const mergeDayLog = (a: DayLog, b: DayLog): DayLog => {
  const out: DayLog = { ...a };
  for (const [day, count] of Object.entries(b)) out[day] = Math.max(out[day] ?? 0, count);
  return out;
};

/** Each device only counts its own answers, so the larger count of a device's day is the true one. */
export const mergeActivity = (a: ActivityByDevice, b: ActivityByDevice): ActivityByDevice => {
  const out: ActivityByDevice = { ...a };
  for (const [device, log] of Object.entries(b)) out[device] = mergeDayLog(out[device] ?? {}, log);
  return out;
};

/**
 * The later day's counters; on the same day, the larger of each. Counting high keeps a daily cap
 * from being spent twice, once per device.
 */
export const mergeDaily = (a: DailyLog, b: DailyLog): DailyLog => {
  if (a.day !== b.day) return a.day > b.day ? a : b;
  return { day: a.day, reviewed: Math.max(a.reviewed, b.reviewed), introduced: Math.max(a.introduced, b.introduced), streak: Math.max(a.streak, b.streak) };
};

/** Two copies of the progress document as one. Commutative, associative and idempotent. */
export const mergeProgress = (a: ProgressState, b: ProgressState): ProgressState => ({
  chars: mergeRecords(a.chars, b.chars),
  words: mergeRecords(a.words, b.words),
  daily: mergeDaily(a.daily, b.daily),
  wordDaily: mergeDaily(a.wordDaily, b.wordDaily),
  activity: mergeActivity(a.activity, b.activity),
});
