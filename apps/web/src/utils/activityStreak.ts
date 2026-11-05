/**
 * Days in a row with any practice, words or characters, ending today, or yesterday when today has
 * none yet. It reads the calendar's log, so the streak and the calendar always agree.
 */
export const activityStreak = (activity: Record<string, number>, now = new Date()): number => {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const active = (d: Date) => (activity[d.toLocaleDateString('sv-SE')] ?? 0) > 0;
  if (!active(day)) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (active(day)) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
};
