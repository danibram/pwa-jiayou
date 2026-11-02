import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import type { AssembledCharacter, HskLevel } from './types';
import { computeFlags } from './flags';
import { mergeCharacter } from './merge';
import { globalAudioPath, strokeFilePath } from './paths';
import { citationSyllableKey } from './syllableKey';
import {
  ensureDraftsFromSidecar,
  findRowByChar,
  loadDrafts,
  loadOverrides,
  loadSidecar,
  loadLevelRows,
} from './store';

const readStrokeMeta = (level: AssembledCharacter['character']['hsk_level'], character: string) => {
  const path = strokeFilePath(level, character);
  if (!existsSync(path)) return { strokeFile: false, strokeCountFromFile: null as number | null };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { strokes?: unknown[] };
    const count = Array.isArray(raw.strokes) ? raw.strokes.length : null;
    return { strokeFile: true, strokeCountFromFile: count };
  } catch {
    return { strokeFile: true, strokeCountFromFile: null };
  }
};

export const assembleCharacter = (char: string): AssembledCharacter | null => {
  const found = findRowByChar(char);
  if (!found) return null;
  const { level, base } = found;
  ensureDraftsFromSidecar(level);

  const draft = loadDrafts(level)[char];
  const override = loadOverrides(level)[char];
  const sidecar =
    level === 1 || level >= 4 ? loadSidecar(level)[char] : undefined;

  const { character, provenance, locked } = mergeCharacter(base, draft, override, sidecar);

  const { strokeFile, strokeCountFromFile } = readStrokeMeta(level, char);
  if (character.stroke_count === 0 && strokeCountFromFile) {
    character.stroke_count = strokeCountFromFile;
  }

  const citationSyllable = citationSyllableKey(character.pinyin);
  const audio = {
    f: citationSyllable ? existsSync(globalAudioPath('f', citationSyllable)) : false,
    m: citationSyllable ? existsSync(globalAudioPath('m', citationSyllable)) : false,
    c: citationSyllable ? existsSync(globalAudioPath('c', citationSyllable)) : false,
  };

  const flags = computeFlags(character, strokeFile, strokeCountFromFile);

  return {
    character,
    provenance,
    locked,
    flags,
    media: {
      strokeFile,
      strokeCountFromFile,
      citationSyllable,
      audio,
    },
  };
};

export const reviewLevel = (level: HskLevel) => {
  ensureDraftsFromSidecar(level);
  const rows = loadLevelRows(level);
  const items: AssembledCharacter[] = [];
  for (const row of rows) {
    const assembled = assembleCharacter(row.character);
    if (assembled && assembled.flags.length > 0) items.push(assembled);
  }
  return items;
};
