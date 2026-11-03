import { describe, expect, it } from 'vitest';
import { buildCharQueue, buildWordQueue, currentDaily, dayKey, emptyDaily } from '../src/domain/progress/queue';
import type { CharProgress } from '../src/domain/progress/types';

const DAY = 86_400_000;
const now = new Date(2026, 10, 3, 12).getTime();
const seen = (due: number, interval = 3): CharProgress => ({
  right: 1, wrong: 0, reps: 1, lapses: 0, interval, ease: 2.5, due, strokeRuns: 0, strokeBest: null, lastSeen: 0, clean: 1,
});

describe('queue rules without a store', () => {
  it('rolls the daily log over and keeps the streak only after an active yesterday', () => {
    const yesterday = { day: dayKey(now - DAY), reviewed: 2, introduced: 0, streak: 4 };
    expect(currentDaily(yesterday, now)).toEqual({ day: dayKey(now), reviewed: 0, introduced: 0, streak: 4 });
    expect(currentDaily({ ...yesterday, day: dayKey(now - 2 * DAY) }, now).streak).toBe(0);
  });

  it('puts the most overdue words first and caps new ones at ten a session', () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}` }));
    const progress = { w5: seen(now - DAY), w6: seen(now - 3 * DAY), w7: seen(now + DAY) };
    const queue = buildWordQueue(entries, progress, emptyDaily(now), 0, now);
    expect(queue.due.map((e) => e.id)).toEqual(['w6', 'w5']);
    expect(queue.fresh).toHaveLength(10);
    expect(buildWordQueue(entries, progress, { ...emptyDaily(now), introduced: 15 }, 10, now).fresh).toHaveLength(5);
  });

  it('keeps a character missed today out of today\'s due cards', () => {
    const chars = [{ character: '一' }, { character: '二' }];
    const progress = { 一: { ...seen(now - 1000, 0), wrong: 1 }, 二: seen(now - DAY) };
    expect(buildCharQueue(chars, progress, emptyDaily(now), 0, () => false, now).due.map((c) => c.character)).toEqual(['二']);
  });
});
