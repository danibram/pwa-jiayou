import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_PER_DAY, progressStore } from '../src/stores/progressStore';

describe('progressStore', () => {
  beforeEach(() => {
    vi.useRealTimers();
    progressStore.clear();
  });

  it('schedules good answers at growing intervals', () => {
    progressStore.grade('好', 'good');
    expect(progressStore.get('好')!.interval).toBe(1);
    progressStore.grade('好', 'good');
    expect(progressStore.get('好')!.interval).toBe(3);
    progressStore.grade('好', 'good');
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
    progressStore.grade('大', 'good');
    progressStore.grade('大', 'good');
    progressStore.grade('大', 'hard');
    const p = progressStore.get('大')!;
    expect(p.interval).toBe(4);
    expect(p.ease).toBeCloseTo(2.35);
  });

  it('counts a character as mastered once its interval reaches three weeks', () => {
    for (let i = 0; i < 5; i++) progressStore.grade('中', 'good');
    expect(progressStore.get('中')!.interval).toBeGreaterThanOrEqual(21);
    expect(progressStore.isMastered('中')).toBe(true);
  });

  it('builds a queue of due cards plus a capped number of new ones', () => {
    const chars = Array.from({ length: 30 }, (_, i) => ({
      character: String.fromCharCode(0x4e00 + i),
    }));
    progressStore.grade(chars[5].character, 'again');
    const { due, fresh } = progressStore.buildQueue(chars);
    expect(due.map((c) => c.character)).toEqual([chars[5].character]);
    expect(fresh.length).toBe(NEW_PER_DAY - 1);
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

  it('migrates the old flat storage format', async () => {
    localStorage.setItem(
      'hsk-flashcards-stats',
      JSON.stringify({
        的: { right: 1, wrong: 2, streak: 0, strokeRuns: 0, strokeBest: null, lastSeen: 1 },
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
