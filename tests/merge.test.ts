import { describe, expect, it } from 'vitest';
import type { ActivityByDevice } from '../src/domain/progress/activity';
import type { CharProgress, DailyLog, ProgressState } from '../src/domain/progress/types';
import { mergeProgress, mergeRecords } from '../src/domain/sync/merge';
import { vocabulary } from '../src/data/vocabulary';
import { createMemoryKeyValue } from '../src/persistence/keyValue';
import { createMyWordsStore, type MyWordRecord } from '../src/stores/myWordsStore';

/** mulberry32: a small seeded generator, so a failing case can be replayed from its seed. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Rng = () => number;
const int = (rng: Rng, max: number) => Math.floor(rng() * max);
const pick = <T>(rng: Rng, items: readonly T[]) => items[int(rng, items.length)];

// Few ids, devices and times, so copies often hold the same record and often tie.
const IDS = ['一', '二', '三', '四', '五'];
const DEVICES = ['phone', 'laptop', 'tablet'];
const DAYS = ['2026-10-30', '2026-10-31', '2026-11-01'];

const record = (rng: Rng): CharProgress => ({
  right: int(rng, 5), wrong: int(rng, 3), reps: int(rng, 4), lapses: int(rng, 2), interval: int(rng, 30),
  ease: pick(rng, [1.3, 2.35, 2.5]), due: int(rng, 1000), strokeRuns: int(rng, 2), strokeBest: pick(rng, [null, 0, 3]),
  lastSeen: int(rng, 1000), clean: int(rng, 3), updatedAt: int(rng, 4), deviceId: pick(rng, DEVICES),
});

const records = (rng: Rng) => Object.fromEntries(IDS.filter(() => rng() < 0.6).map((id) => [id, record(rng)]));

const daily = (rng: Rng): DailyLog => ({ day: pick(rng, DAYS), reviewed: int(rng, 20), introduced: int(rng, 10), streak: int(rng, 5) });

const activity = (rng: Rng): ActivityByDevice => Object.fromEntries(
  DEVICES.filter(() => rng() < 0.6).map((device) => [device, Object.fromEntries(DAYS.filter(() => rng() < 0.6).map((day) => [day, int(rng, 30)]))]),
);

const progress = (rng: Rng): ProgressState => ({ chars: records(rng), words: records(rng), daily: daily(rng), wordDaily: daily(rng), activity: activity(rng) });

const myWord = (rng: Rng): MyWordRecord => ({
  addedAt: int(rng, 4),
  removedAt: pick(rng, [null, null, 2]),
  updatedAt: int(rng, 4),
  deviceId: pick(rng, DEVICES),
  ...(rng() < 0.5 ? { own: { simplified: '一', traditional: '一', pinyin: 'yī', meaning: pick(rng, ['uno', 'one']), topicIds: [] } } : {}),
});

const myWords = (rng: Rng) => Object.fromEntries(IDS.filter(() => rng() < 0.6).map((id) => [id, myWord(rng)]));

const RUNS = 300;

describe('progress merge', () => {
  it('is commutative, idempotent and associative', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const rng = random(seed);
      const [a, b, c] = [progress(rng), progress(rng), progress(rng)];
      expect(mergeProgress(a, b), `seed ${seed}`).toEqual(mergeProgress(b, a));
      expect(mergeProgress(a, a), `seed ${seed}`).toEqual(a);
      expect(mergeProgress(mergeProgress(a, b), c), `seed ${seed}`).toEqual(mergeProgress(a, mergeProgress(b, c)));
    }
  });

  it('keeps every record of either side, and the later write of one both have', () => {
    const base = record(random(1));
    const older = { ...base, right: 1, updatedAt: 10, deviceId: 'phone' };
    const newer = { ...base, right: 7, updatedAt: 20, deviceId: 'laptop' };
    const tieBreak = { ...base, right: 3, updatedAt: 10, deviceId: 'tablet' };
    expect(mergeRecords({ 一: older, 二: older }, { 一: newer, 三: newer })).toEqual({ 一: newer, 二: older, 三: newer });
    expect(mergeRecords({ 一: older }, { 一: tieBreak })).toEqual({ 一: tieBreak });
  });

  it('takes the larger count per device and day, never adding a count twice', () => {
    const day = { day: '2026-11-01', reviewed: 0, introduced: 0, streak: 0 };
    const local: ProgressState = { chars: {}, words: {}, daily: day, wordDaily: day, activity: { phone: { '2026-11-01': 5 } } };
    const backup: ProgressState = { ...local, activity: { phone: { '2026-11-01': 3, '2026-10-31': 2 }, laptop: { '2026-11-01': 4 } } };
    expect(mergeProgress(local, backup).activity).toEqual({ phone: { '2026-11-01': 5, '2026-10-31': 2 }, laptop: { '2026-11-01': 4 } });
  });
});

describe('Mis palabras merge', () => {
  it('is commutative, idempotent and associative', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const rng = random(seed);
      const [a, b, c] = [myWords(rng), myWords(rng), myWords(rng)];
      expect(mergeRecords(a, b), `seed ${seed}`).toEqual(mergeRecords(b, a));
      expect(mergeRecords(a, a), `seed ${seed}`).toEqual(a);
      expect(mergeRecords(mergeRecords(a, b), c), `seed ${seed}`).toEqual(mergeRecords(a, mergeRecords(b, c)));
    }
  });

  it('loses no word added on either of two devices, and keeps a later removal', () => {
    const phone = createMyWordsStore(createMemoryKeyValue(), { deviceId: 'phone' });
    const laptop = createMyWordsStore(createMemoryKeyValue(), { deviceId: 'laptop' });
    phone.addCatalog(vocabulary[0].id);
    phone.addCatalog(vocabulary[2].id);
    laptop.addCatalog(vocabulary[1].id);
    laptop.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    phone.mergeData(laptop.exportData());
    expect([...phone.ids].sort()).toEqual([vocabulary[0].id, vocabulary[1].id, vocabulary[2].id, 'word-5976-8336-nai3-cha2'].sort());
    expect(phone.findWord('word-5976-8336-nai3-cha2')?.meaning).toBe('té con leche');
    // The laptop takes one off after the merge; merging again carries the removal over.
    laptop.mergeData(phone.exportData());
    laptop.remove(vocabulary[2].id);
    phone.mergeData(laptop.exportData());
    expect(phone.has(vocabulary[2].id)).toBe(false);
    expect(phone.ids).toEqual(laptop.ids);
  });
});
