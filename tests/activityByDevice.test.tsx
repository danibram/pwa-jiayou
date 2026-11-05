import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActivityCalendar from '../src/components/ActivityCalendar';
import { sumActivity } from '../src/domain/progress/activity';
import { activityStreak } from '../src/domain/progress/queue';
import { KEYS } from '../src/persistence/keys';
import { createMemoryKeyValue } from '../src/persistence/keyValue';
import { createProgressState } from '../src/stores/progressState';
import { createProgressStore } from '../src/stores/progressStore';

// Sunday 1 November 2026, noon.
const today = new Date(2026, 10, 1, 12);
const day = { day: '2026-11-01', reviewed: 0, introduced: 0, streak: 0 };

/** A learner's log as one device kept it before logs were per device: a four-day streak and older gaps. */
const sample = {
  '2026-09-14': 12,
  '2026-10-05': 3,
  '2026-10-20': 40,
  '2026-10-21': 1,
  '2026-10-29': 8,
  '2026-10-30': 22,
  '2026-10-31': 5,
  '2026-11-01': 17,
};

const storeWith = (activity: unknown) => {
  const repo = createMemoryKeyValue({ [KEYS.progress]: JSON.stringify({ version: 4, chars: {}, daily: day, words: {}, wordDaily: day, activity }) });
  return createProgressStore(createProgressState(repo, { deviceId: 'phone' }));
};

afterEach(() => { vi.useRealTimers(); });

describe('activity per device', () => {
  it('gives the same calendar and streak as the single log with one device', () => {
    vi.useFakeTimers();
    vi.setSystemTime(today);
    const store = storeWith({ phone: sample });
    expect(store.activity()).toEqual(sample);
    expect(activityStreak(sample, today)).toBe(4);
    expect(store.streak()).toBe(4);
    expect(store.daily.streak).toBe(4);
    const before = render(() => <ActivityCalendar activity={sample} today={today} />);
    const after = render(() => <ActivityCalendar activity={store.activity()} today={today} />);
    expect(after.container.innerHTML).toBe(before.container.innerHTML);
    expect(after.getByText('Esta semana has practicado 4 días')).toBeTruthy();
  });

  it('adds devices up: a day practised on either one counts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(today);
    const store = storeWith({ phone: { '2026-10-30': 2, '2026-11-01': 1 }, laptop: { '2026-10-31': 4, '2026-11-01': 3 } });
    expect(store.activity()).toEqual({ '2026-10-30': 2, '2026-10-31': 4, '2026-11-01': 4 });
    expect(store.streak()).toBe(3);
  });

  it('counts an answer only in this device log', () => {
    vi.useFakeTimers();
    vi.setSystemTime(today);
    const repo = createMemoryKeyValue();
    const store = createProgressStore(createProgressState(repo, { deviceId: 'phone' }));
    store.grade('一', 'good');
    expect(JSON.parse(repo.read(KEYS.progress)!).activity).toEqual({ phone: { '2026-11-01': 1 } });
  });

  it('sums nothing to nothing', () => {
    expect(sumActivity({})).toEqual({});
  });
});
