import { beforeEach, describe, expect, it } from 'vitest';
import { KNOWN_PER_SESSION } from '../src/domain/progress/queue';
import { CHAR_NEW_PER_DAY, progressStore } from '../src/stores/progressStore';

describe('the character day', () => {
  beforeEach(() => progressStore.clear());

  it('teaches eight new characters a day', () => {
    expect(CHAR_NEW_PER_DAY).toBe(8);
    const chars = Array.from({ length: 30 }, (_, i) => ({ character: String.fromCharCode(0x4e00 + i) }));
    expect(progressStore.buildQueue(chars).fresh).toHaveLength(8);
  });

  it('keeps characters known from words out of the new slots', () => {
    const chars = Array.from({ length: 40 }, (_, i) => ({ character: String.fromCharCode(0x4e00 + i) }));
    const known = new Set(chars.slice(0, 15).map((c) => c.character));
    const queue = progressStore.buildQueue(chars, 0, (char) => known.has(char));
    expect(queue.known).toHaveLength(KNOWN_PER_SESSION);
    expect(queue.fresh).toHaveLength(CHAR_NEW_PER_DAY);
    expect(queue.fresh.some((c) => known.has(c.character))).toBe(false);
  });

  it('closes once the new ones are taught, even after a miss today', () => {
    const chars = Array.from({ length: 10 }, (_, i) => ({ character: String.fromCharCode(0x4e00 + i) }));
    const { fresh } = progressStore.buildQueue(chars);
    for (const c of fresh.slice(1)) progressStore.introduce(c.character);
    progressStore.grade(fresh[0].character, 'again');
    const after = progressStore.buildQueue(chars);
    expect(after.due).toHaveLength(0);
    expect(after.fresh).toHaveLength(0);
  });
});
