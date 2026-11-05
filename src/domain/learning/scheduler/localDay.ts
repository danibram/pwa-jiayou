import type { LocalDay, Timestamp } from '../types';

/**
 * How the caller's device splits time into local days ("Inicio del día" in contracts.md). The domain
 * never reads the time zone itself: the app passes the device rule, tests pass a fixed one.
 */
export interface LocalDayRule {
  /** The local calendar day that contains `now`, as `dayKey` writes it. */
  localDay(now: Timestamp): LocalDay;
  /** The first instant of the next local day. */
  nextLocalMidnight(now: Timestamp): Timestamp;
}

const DAY_MS = 86_400_000;
const LOCAL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** Calendar arithmetic on a day label: no time zone, so it never meets a daylight saving change. */
export const addLocalDays = (day: LocalDay, days: number): LocalDay => {
  const match = LOCAL_DAY.exec(day);
  if (!match) throw new Error(`Invalid local day "${day}"`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + days * DAY_MS);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}` as LocalDay;
};

/**
 * The device's own rule, the one `dayKey` (`toLocaleDateString('sv-SE')`) and `endOfDay`
 * (`setHours`) use today. It reads the time zone, never the clock.
 */
export const deviceLocalDayRule: LocalDayRule = {
  localDay: (now) => new Date(now).toLocaleDateString('sv-SE') as LocalDay,
  nextLocalMidnight: (now) => {
    const date = new Date(now);
    date.setHours(24, 0, 0, 0);
    return date.getTime();
  },
};
