import { describe, expect, test } from 'bun:test';
import { computeFlags } from '../src/flags';
import { lockedFromOverride, mergeCharacter, parseBaseRow } from '../src/merge';
import { syllableKey } from '../src/syllableKey';
import type { HSKCharacter } from '../src/types';

describe('syllableKey', () => {
  test('āi maps to ai', () => {
    expect(syllableKey('āi')).toBe('ai');
  });

  test('mǎ maps to ma3', () => {
    expect(syllableKey('mǎ')).toBe('ma3');
  });
});

describe('mergeCharacter', () => {
  const base: HSKCharacter = {
    character: '按',
    traditional: '按',
    pinyin: 'àn',
    definition: 'press',
    radical: '手',
    stroke_count: 9,
    hsk_level: 4,
    general_standard: 0,
    frequency_rank: 0,
    gloss: 'auto gloss',
    example: { word: '按下', pinyin: 'àn xià', es: 'auto gloss' },
  };

  test('override wins over draft and base for gloss', () => {
    const { character } = mergeCharacter(
      base,
      { gloss: 'draft gloss' },
      { gloss: 'pulsar; según' },
    );
    expect(character.gloss).toBe('pulsar; según');
  });

  test('draft wins over base when no override', () => {
    const { character } = mergeCharacter(base, { gloss: 'draft gloss' }, undefined);
    expect(character.gloss).toBe('draft gloss');
  });

  test('locked fields from partial override', () => {
    const locked = lockedFromOverride({ example: { es: 'pulsar hacia abajo' } });
    expect(locked.gloss).toBe(false);
    expect(locked['example.es']).toBe(true);
  });

  test('partial example override merges', () => {
    const { character } = mergeCharacter(
      base,
      { example: { word: '按下', pinyin: 'àn xià', es: 'draft es' } },
      { example: { es: 'pulsar hacia abajo' } },
    );
    expect(character.example?.es).toBe('pulsar hacia abajo');
    expect(character.example?.word).toBe('按下');
  });
});

describe('computeFlags', () => {
  test('detects example_es_equals_gloss', () => {
    const character: HSKCharacter = {
      character: '按',
      traditional: '按',
      pinyin: 'àn',
      definition: 'presionar',
      radical: '手',
      stroke_count: 9,
      hsk_level: 4,
      general_standard: 0,
      frequency_rank: 0,
      gloss: 'presionar',
      example: { word: '按下', pinyin: 'àn xià', es: 'presionar' },
    };
    const flags = computeFlags(character, true, 9);
    expect(flags).toContain('example_es_equals_gloss');
  });

  test('detects definition_english', () => {
    const character = parseBaseRow({
      character: '哀',
      pinyin: 'āi',
      definition: 'sad, mournful',
      radical: '口',
      hsk_level: 6,
    });
    const flags = computeFlags(character, false, null);
    expect(flags).toContain('definition_english');
  });
});
