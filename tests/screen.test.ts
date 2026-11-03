import { describe, expect, it } from 'vitest';
import { parseScreen } from '../src/screen';

describe('screen history', () => {
  it('preserves the origin of a word detail', () => {
    expect(parseScreen({ page: 'vocabulario', wordId: 'word', returnTo: 'mis-palabras' })).toEqual({
      page: 'vocabulario', topic: false, wordId: 'word', returnTo: 'mis-palabras',
    });
  });

  it('ignores an unrecognized origin in stored history', () => {
    expect(parseScreen({ page: 'vocabulario', wordId: 'word', returnTo: 'unknown' })).toEqual({
      page: 'vocabulario', topic: false, wordId: 'word',
    });
  });
});
