import { describe, expect, it } from 'vitest';
import { parseCheckpoint } from '../src/domain/progress/checkpoint';

// The session checkpoint backed "Descartar y salir", which the learning system removed. Only the
// domain parser is left until phase 7A retires the v4 progress code.
describe('session checkpoint parser', () => {
  it('rejects a checkpoint that is not valid', () => {
    expect(() => parseCheckpoint('{"version":3}')).toThrow();
    expect(() => parseCheckpoint({ daily: {}, wordDaily: {}, activity: {}, chars: {}, words: {} })).toThrow();
  });
});
