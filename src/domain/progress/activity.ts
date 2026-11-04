/** Answers and first looks per local day, "2026-11-01" → 34. */
export type DayLog = Record<string, number>;

/**
 * Each device's own day log, by device id. A device only ever counts its own answers, so merging
 * two copies takes the larger count per device and day and never adds an answer twice.
 */
export type ActivityByDevice = Record<string, DayLog>;

/** The days in a row the calendar and streak show: every device's answers, added up. */
export const sumActivity = (byDevice: ActivityByDevice): DayLog => {
  const total: DayLog = {};
  for (const log of Object.values(byDevice)) {
    for (const [day, count] of Object.entries(log)) total[day] = (total[day] ?? 0) + count;
  }
  return total;
};
