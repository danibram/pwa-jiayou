import { existsSync, readFileSync } from 'node:fs';
import type { HSKCharacter, ReviewFlag } from './types';
import { globalAudioPath } from './paths';
import { citationSyllableKey } from './syllableKey';

const firstSense = (text: string) => text.split(/[;；]/)[0]?.trim() ?? '';

const looksEnglish = (definition: string) => /^[a-zA-Z]/.test(firstSense(definition));

export const computeFlags = (
  character: HSKCharacter,
  strokeFile: boolean,
  strokeCountFromFile: number | null,
): ReviewFlag[] => {
  const flags: ReviewFlag[] = [];

  if (strokeFile && character.stroke_count === 0 && (strokeCountFromFile ?? 0) > 0) {
    flags.push('stroke_count_zero_with_strokes');
  }
  if (!strokeFile) flags.push('stroke_file_missing');
  if (looksEnglish(character.definition)) flags.push('definition_english');

  const gloss = character.gloss ?? '';
  if (gloss.endsWith(',') || gloss.endsWith('，')) flags.push('gloss_trailing_comma');
  if (gloss.endsWith('…') || gloss.endsWith('...')) flags.push('gloss_trailing_ellipsis');

  if (character.example?.es && character.gloss && character.example.es.trim() === character.gloss.trim()) {
    flags.push('example_es_equals_gloss');
  }
  if (character.example?.word && !character.example.word.includes(character.character)) {
    flags.push('example_word_missing_char');
  }

  const key = citationSyllableKey(character.pinyin);
  if (key) {
    const missingVoice = (['f', 'm', 'c'] as const).some((v) => !existsSync(globalAudioPath(v, key)));
    if (missingVoice) flags.push('citation_audio_missing');
  }

  return flags;
};
