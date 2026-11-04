import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAR_NEW_PER_DAY, progressStore } from '../src/stores/progressStore';

describe('progressStore', () => {
  beforeEach(() => {
    vi.useRealTimers();
    progressStore.clear();
  });

  /** Moves the clock to noon `days` after the start date, the way a learner comes back on the due day. */
  const at = (days: number) => vi.setSystemTime(new Date(Date.UTC(2026, 9, 1, 12) + days * 86_400_000));

  it('schedules good answers at growing intervals, answered on their due day', () => {
    vi.useFakeTimers();
    at(0); progressStore.grade('好', 'good');
    expect(progressStore.get('好')!.interval).toBe(1);
    at(1); progressStore.grade('好', 'good');
    expect(progressStore.get('好')!.interval).toBe(3);
    at(4); progressStore.grade('好', 'good');
    expect(progressStore.get('好')!.interval).toBe(8);
  });

  it('a miss makes the character due again right away and weak', () => {
    progressStore.grade('人', 'good');
    progressStore.grade('人', 'again');
    const p = progressStore.get('人')!;
    expect(p.interval).toBe(0);
    expect(p.lapses).toBe(1);
    expect(progressStore.isDue('人')).toBe(true);
    expect(progressStore.isWeak('人')).toBe(true);
  });

  it('hard grows the interval slowly and lowers ease', () => {
    vi.useFakeTimers();
    at(0); progressStore.grade('大', 'good');
    at(1); progressStore.grade('大', 'good');
    at(4); progressStore.grade('大', 'hard');
    const p = progressStore.get('大')!;
    expect(p.interval).toBe(4);
    expect(p.ease).toBeCloseTo(2.35);
  });

  it('counts a character as mastered once its interval reaches three weeks', () => {
    vi.useFakeTimers();
    let day = 0;
    for (let i = 0; i < 5; i++) {
      at(day); progressStore.grade('中', 'good');
      day += progressStore.get('中')!.interval;
    }
    expect(progressStore.get('中')!.interval).toBeGreaterThanOrEqual(21);
    expect(progressStore.isMastered('中')).toBe(true);
  });

  it('never leaves an item stuck at one day once its ease is at the floor', () => {
    vi.useFakeTimers();
    let day = 0;
    at(day); progressStore.grade('难', 'good');
    for (let i = 0; i < 6; i++) { day += 1; at(day); progressStore.grade('难', 'again'); progressStore.grade('难', 'hard'); }
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      day += progressStore.get('难')!.interval; at(day);
      progressStore.grade('难', 'good');
      intervals.push(progressStore.get('难')!.interval);
    }
    expect(intervals).toEqual([...intervals].sort((a, b) => a - b));
    expect(new Set(intervals).size).toBe(intervals.length);
  });

  it('lowers the ease once per day, however many retries a session holds', () => {
    vi.useFakeTimers();
    at(0); progressStore.grade('错', 'good');
    at(1); progressStore.grade('错', 'good');
    at(4);
    progressStore.grade('错', 'again');
    progressStore.grade('错', 'again');
    progressStore.grade('错', 'again');
    expect(progressStore.get('错')!.ease).toBeCloseTo(2.5 - 0.2);
  });

  it('is due all day on its due date, not from the hour of the last answer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 23, 0));
    progressStore.grade('晚', 'good');
    vi.setSystemTime(new Date(2026, 9, 2, 8, 0));
    expect(progressStore.isDue('晚')).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 1, 23, 30));
    expect(progressStore.isDue('晚')).toBe(false);
  });

  it('grows a late answer from the days the item really survived', () => {
    vi.useFakeTimers();
    at(0); progressStore.grade('久', 'good');
    at(1); progressStore.grade('久', 'good');
    at(4); progressStore.grade('久', 'good');
    expect(progressStore.get('久')!.interval).toBe(8);
    at(42); progressStore.grade('久', 'good');
    expect(progressStore.get('久')!.interval).toBeGreaterThanOrEqual(Math.round(38 * 2.5));
  });

  it('brings an item missed in free practice back by tomorrow without touching its ease', () => {
    vi.useFakeTimers();
    let day = 0;
    for (let i = 0; i < 5; i++) { at(day); progressStore.grade('远', 'good'); day += progressStore.get('远')!.interval; }
    const before = { ...progressStore.get('远')! };
    at(day - before.interval + 2);
    progressStore.practice('远', false);
    const after = progressStore.get('远')!;
    expect(after.ease).toBe(before.ease);
    expect(after.due).toBeLessThan(before.due);
    at(day - before.interval + 3);
    expect(progressStore.isDue('远')).toBe(true);
  });

  it('builds a queue of due cards plus a capped number of new ones', () => {
    const chars = Array.from({ length: 30 }, (_, i) => ({
      character: String.fromCharCode(0x4e00 + i),
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T12:00:00'));
    progressStore.grade(chars[5].character, 'again');
    vi.setSystemTime(new Date('2026-10-30T12:00:00'));
    const { due, fresh } = progressStore.buildQueue(chars);
    vi.useRealTimers();
    expect(due.map((c) => c.character)).toEqual([chars[5].character]);
    expect(fresh.length).toBe(CHAR_NEW_PER_DAY);
    expect(fresh[0]).toBe(chars[0]);
  });

  it('a first look is due tomorrow and is not a grade', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T12:00:00'));
    progressStore.introduce('的');
    const p = progressStore.get('的')!;
    expect(p.right + p.wrong).toBe(0);
    expect(p.interval).toBe(1);
    expect(progressStore.isNew('的')).toBe(false);
    expect(progressStore.isDue('的')).toBe(false);
    expect(progressStore.daily.introduced).toBe(1);
    expect(progressStore.daily.reviewed).toBe(0);
    vi.setSystemTime(new Date('2026-10-31T12:00:00'));
    expect(progressStore.isDue('的')).toBe(true);
  });

  it('tracks the daily count and streak', () => {
    progressStore.grade('一', 'good');
    progressStore.grade('二', 'again');
    expect(progressStore.daily.reviewed).toBe(2);
    expect(progressStore.daily.introduced).toBe(2);
    expect(progressStore.daily.streak).toBe(1);
  });

  it('keeps the best stroke practice score', () => {
    progressStore.recordStrokes('我', 3);
    progressStore.recordStrokes('我', 1);
    progressStore.recordStrokes('我', 4);
    expect(progressStore.get('我')).toMatchObject({ strokeRuns: 3, strokeBest: 1 });
  });

  it('loads a saved document, filling fields a record leaves out', async () => {
    localStorage.setItem(
      'hsk-flashcards-stats',
      JSON.stringify({
        version: 4,
        chars: { 的: { right: 1, wrong: 2, strokeRuns: 0, strokeBest: null, lastSeen: 1 } },
        daily: { day: '2026-10-31', reviewed: 0, introduced: 0, streak: 0 },
        words: {},
        wordDaily: { day: '2026-10-31', reviewed: 0, introduced: 0, streak: 0 },
      })
    );
    vi.resetModules();
    const fresh = (await import('../src/stores/progressStore')).progressStore;
    expect(fresh.get('的')).toMatchObject({ right: 1, wrong: 2, ease: 2.5 });
    expect(fresh.isDue('的')).toBe(true);
    localStorage.removeItem('hsk-flashcards-stats');
  });
});

describe('free practice', () => {
  beforeEach(() => progressStore.clear());

  it('does not move a card that is not due', () => {
    progressStore.grade('好', 'good');
    const before = { ...progressStore.get('好')! };
    progressStore.practice('好', true);
    const after = progressStore.get('好')!;
    expect(after.interval).toBe(before.interval);
    expect(after.due).toBe(before.due);
    expect(after.right).toBe(before.right + 1);
  });

  it('does not introduce new characters', () => {
    progressStore.practice('新', true);
    expect(progressStore.isNew('新')).toBe(true);
    expect(progressStore.daily.introduced).toBe(0);
  });
});
