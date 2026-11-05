import { describe, expect, it } from 'vitest';
import { readHomeSnapshot, rememberHomeSnapshot } from '../src/utils/homeSnapshot';

describe('Home snapshot', () => {
  it('reads back what Home remembered for the same scope only', () => {
    rememberHomeSnapshot('vocabulary', 'hsk-1', { mastered: 3, learning: 5 });
    expect(localStorage.getItem('jiayou-home-last-vocabulary')).toBe(JSON.stringify({ scope: 'hsk-1', mastered: 3, learning: 5 }));
    expect(readHomeSnapshot('vocabulary', 'hsk-1')).toEqual({ mastered: 3, learning: 5 });
    expect(readHomeSnapshot('vocabulary', 'hsk-1,hsk-2')).toBeNull();
  });
});
