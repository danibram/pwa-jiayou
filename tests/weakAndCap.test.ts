import { beforeEach, describe, expect, it } from 'vitest';
import { parseProgress, progressStore } from '../src/stores/progressStore';

// Word rules (weak, daily budget, Flojos) live in the learning system and its tests. These cover the
// v4 character progress that stays until phase 5C.

beforeEach(() => { localStorage.clear(); progressStore.clear(); });

describe('weak items', () => {
  it('counts a character missed at first meeting', () => {
    progressStore.grade('一', 'again');
    expect(progressStore.isWeak('一')).toBe(true);
  });

  it('reads a record without the counter from successful reviews', () => {
    const saved = parseProgress(JSON.stringify({ version: 4, chars: { 一: { right: 3, wrong: 1, reps: 2, interval: 3, due: 1 } }, daily: { day: '2026-01-01', reviewed: 0, introduced: 0, streak: 0 }, words: {}, wordDaily: { day: '2026-01-01', reviewed: 0, introduced: 0, streak: 0 } }));
    expect(saved.chars['一'].clean).toBe(2);
  });
});

describe('activity calendar', () => {
  it('counts character answers on today', () => {
    progressStore.grade('一', 'good');
    progressStore.grade('二', 'good');
    const day = new Date().toLocaleDateString('sv-SE');
    expect(progressStore.activity()[day]).toBe(2);
  });

  it('reads saves without a calendar', () => {
    const saved = parseProgress(JSON.stringify({ version: 4, chars: {}, daily: { day: '2026-01-01', reviewed: 0, introduced: 0, streak: 0 }, words: {}, wordDaily: { day: '2026-01-01', reviewed: 0, introduced: 0, streak: 0 } }));
    expect(saved.activity).toEqual({});
  });
});

describe('flojos session recovery', () => {
  it('takes a weak character off the list with one Bien', () => {
    progressStore.grade('一', 'again');
    expect(progressStore.recoverWeak('一')).toBe(true);
    expect(progressStore.isWeak('一')).toBe(false);
  });
});
