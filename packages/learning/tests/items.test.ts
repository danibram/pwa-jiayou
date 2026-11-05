import { describe, expect, it } from 'vitest';
import { characterItemId, characterOf, itemKind, wordIdOf, wordItemId } from '../src/items.ts';

describe('item ids', () => {
  it('round-trips a word and a character', () => {
    const word = wordItemId('word-4f60-597d-ni3-hao3');
    expect(word).toBe('word-meaning:word-4f60-597d-ni3-hao3');
    expect(itemKind(word)).toBe('word-meaning');
    expect(wordIdOf(word)).toBe('word-4f60-597d-ni3-hao3');
    expect(characterOf(word)).toBeNull();

    const char = characterItemId('好');
    expect(char).toBe('character-writing:char-597d');
    expect(itemKind(char)).toBe('character-writing');
    expect(characterOf(char)).toBe('好');
    expect(wordIdOf(char)).toBeNull();
  });

  it('reads no character from a malformed id', () => {
    expect(characterOf('character-writing:char-zz')).toBeNull();
    expect(characterOf('character-writing:char-110000')).toBeNull();
  });
});
