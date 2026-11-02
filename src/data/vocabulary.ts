import type { HskLevel } from '../types';
import { withToneSandhi } from '../utils/pinyin';
import hsk1 from './vocabulary/hsk1.json';
import hsk2 from './vocabulary/hsk2.json';
import hsk3 from './vocabulary/hsk3.json';
import hsk4 from './vocabulary/hsk4.json';
import hsk5 from './vocabulary/hsk5.json';
import hsk6 from './vocabulary/hsk6.json';

export interface VocabularyEntry {
  id: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  meaning: string;
  /** The HSK level of a catalog word. Words the learner adds have none. */
  level?: HskLevel;
  characters: string[];
  topicIds: string[];
  sourceId: string;
}

/** A word from the HSK lists that ship with the app. */
export type CatalogEntry = VocabularyEntry & { level: HskLevel };

export const vocabularySources = {
  'hsk-2-0': {
    title: 'Complete HSK Vocabulary, HSK 2.0',
    url: 'https://github.com/drkameleon/complete-hsk-vocabulary/tree/main/wordlists/exclusive/old',
    license: 'MIT; CC BY-SA 4.0 for translated definitions',
    retrieved: '2026-11-01',
    definitionLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    edition: 'HSK 2.0',
  },
  'curated-extra': {
    title: 'Palabras básicas añadidas por Jiāyóu',
    url: '',
    license: 'Propia',
    retrieved: '2026-11-01',
    definitionLicenseUrl: '',
    edition: 'Fuera de las listas HSK 2.0',
  },
  mine: {
    title: 'Mis palabras',
    url: '',
    license: 'Propia',
    retrieved: '',
    definitionLicenseUrl: '',
    edition: 'Añadida por ti',
  },
} as const;

export const vocabularyCoverage = {
  edition: 'HSK 2.0',
  levels: [1, 2, 3, 4, 5, 6] as const satisfies readonly HskLevel[],
  complete: true,
  description: 'Vocabulario HSK 2.0 completo, listas exclusivas por nivel',
  // HSK 1 has the 150 official words plus 你好 from curated/extra-words-es.json.
  counts: { 1: 151, 2: 147, 3: 298, 4: 598, 5: 1298, 6: 2500 } as const,
} as const;

const isHskLevel = (value: unknown): value is HskLevel =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;

const parseEntry = (raw: unknown): CatalogEntry => {
  if (!raw || typeof raw !== 'object') throw new Error('Entrada de vocabulario inválida.');
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) throw new Error('Palabra sin id.');
  if (typeof row.simplified !== 'string' || !row.simplified) throw new Error('Palabra sin simplified.');
  if (typeof row.traditional !== 'string' || !row.traditional) throw new Error(`Sin traditional: ${row.simplified}`);
  if (typeof row.pinyin !== 'string' || !row.pinyin) throw new Error(`Sin pinyin: ${row.simplified}`);
  if (typeof row.meaning !== 'string' || !row.meaning) throw new Error(`Sin meaning: ${row.simplified}`);
  if (!isHskLevel(row.level)) throw new Error(`Nivel inválido: ${row.simplified}`);
  if (!Array.isArray(row.characters) || row.characters.some((c) => typeof c !== 'string')) {
    throw new Error(`Caracteres inválidos: ${row.simplified}`);
  }
  if (!Array.isArray(row.topicIds) || row.topicIds.some((id) => typeof id !== 'string')) {
    throw new Error(`Temas inválidos: ${row.simplified}`);
  }
  if (typeof row.sourceId !== 'string' || !row.sourceId) throw new Error(`Sin sourceId: ${row.simplified}`);
  return {
    id: row.id,
    simplified: row.simplified,
    traditional: row.traditional,
    // The lists write dictionary tones (yī dìng); cards show what learners hear (yí dìng).
    pinyin: withToneSandhi(row.simplified, row.pinyin),
    meaning: row.meaning,
    level: row.level,
    characters: row.characters as string[],
    topicIds: row.topicIds as string[],
    sourceId: row.sourceId,
  };
};

const parseList = (value: unknown, level: HskLevel): CatalogEntry[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`Lista vacía de HSK ${level}.`);
  const entries = value.map(parseEntry);
  if (entries.some((entry) => entry.level !== level)) {
    throw new Error(`La lista de HSK ${level} mezcla otros niveles.`);
  }
  return entries;
};

export const vocabularyByLevel: Record<HskLevel, CatalogEntry[]> = {
  1: parseList(hsk1, 1),
  2: parseList(hsk2, 2),
  3: parseList(hsk3, 3),
  4: parseList(hsk4, 4),
  5: parseList(hsk5, 5),
  6: parseList(hsk6, 6),
};

export const vocabulary: CatalogEntry[] = [
  ...vocabularyByLevel[1],
  ...vocabularyByLevel[2],
  ...vocabularyByLevel[3],
  ...vocabularyByLevel[4],
  ...vocabularyByLevel[5],
  ...vocabularyByLevel[6],
];

export const vocabularyLevels: HskLevel[] = [1, 2, 3, 4, 5, 6];
