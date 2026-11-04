import type { HskLevel } from '../types';
import { withToneSandhi } from '../utils/pinyin';
import type { WordRelation } from './wordRelations';
import { isWordRelationKind } from './wordRelations';
import hsk1 from './vocabulary/hsk1.json';
import hsk2 from './vocabulary/hsk2.json';
import hsk3 from './vocabulary/hsk3.json';
import hsk4 from './vocabulary/hsk4.json';
import hsk5 from './vocabulary/hsk5.json';
import hsk6 from './vocabulary/hsk6.json';
import extra from './vocabulary/extra.json';
import examples from './vocabulary/examples.json';

export interface VocabularyExample {
  chinese: string;
  spanish: string;
}

export const vocabularyExample = (simplified: string): VocabularyExample | undefined =>
  (examples as Record<string, VocabularyExample>)[simplified];

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
  /** Editorial links to other catalog words (synonyms, antonyms, …). Omitted when empty. */
  relations?: WordRelation[];
}

export type { WordRelation, WordRelationKind } from './wordRelations';

/** A word from the HSK lists that ship with the app. */
export type CatalogEntry = VocabularyEntry & { level: HskLevel };

export const vocabularySources = {
  'asia-idiomas': {
    title: 'Asia Idiomas, vocabulario HSK 1 a 3',
    url: 'https://www.asiaidiomas.es/descargas/HSK1-VOCABULARIO.pdf',
    license: 'Fuente consultada para vocabulario y ejemplos',
    retrieved: '2026-11-04',
    definitionLicenseUrl: '',
    edition: 'HSK 2.0',
  },
  'hsk-2-0': {
    title: 'Complete HSK Vocabulary, HSK 2.0',
    url: 'https://github.com/drkameleon/complete-hsk-vocabulary/tree/main/wordlists/exclusive/old',
    license: 'MIT; CC BY-SA 4.0 for translated definitions',
    retrieved: '2026-11-01',
    definitionLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    edition: 'HSK 2.0',
  },
  'curated-extra': {
    title: 'Extra',
    url: '',
    license: 'Propia',
    retrieved: '2026-11-01',
    definitionLicenseUrl: '',
    edition: 'Fuera de las listas HSK 2.0, curada en el editor de contenidos',
  },
} as const;


const isHskLevel = (value: unknown): value is HskLevel =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;

const parseEntry = (raw: unknown, allowExtra = false): CatalogEntry => {
  if (!raw || typeof raw !== 'object') throw new Error('Entrada de vocabulario inválida.');
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) throw new Error('Palabra sin id.');
  if (typeof row.simplified !== 'string' || !row.simplified) throw new Error('Palabra sin simplified.');
  if (typeof row.traditional !== 'string' || !row.traditional) throw new Error(`Sin traditional: ${row.simplified}`);
  if (typeof row.pinyin !== 'string' || !row.pinyin) throw new Error(`Sin pinyin: ${row.simplified}`);
  if (typeof row.meaning !== 'string' || !row.meaning) throw new Error(`Sin meaning: ${row.simplified}`);
  if (!isHskLevel(row.level) && !(allowExtra && row.level === undefined)) throw new Error(`Nivel inválido: ${row.simplified}`);
  if (!Array.isArray(row.characters) || row.characters.some((c) => typeof c !== 'string')) {
    throw new Error(`Caracteres inválidos: ${row.simplified}`);
  }
  if (!Array.isArray(row.topicIds) || row.topicIds.some((id) => typeof id !== 'string')) {
    throw new Error(`Temas inválidos: ${row.simplified}`);
  }
  if (typeof row.sourceId !== 'string' || !row.sourceId) throw new Error(`Sin sourceId: ${row.simplified}`);
  let relations: WordRelation[] | undefined;
  if (row.relations !== undefined) {
    if (!Array.isArray(row.relations)) throw new Error(`Relaciones inválidas: ${row.simplified}`);
    relations = [];
    const seen = new Set<string>();
    for (const item of row.relations) {
      if (!item || typeof item !== 'object') throw new Error(`Relación inválida: ${row.simplified}`);
      const link = item as Record<string, unknown>;
      if (!isWordRelationKind(link.kind) || typeof link.id !== 'string' || !link.id) {
        throw new Error(`Relación inválida: ${row.simplified}`);
      }
      const key = `${link.kind}:${link.id}`;
      if (seen.has(key)) throw new Error(`Relación duplicada: ${row.simplified}`);
      seen.add(key);
      relations.push({ kind: link.kind, id: link.id });
    }
    if (!relations.length) relations = undefined;
  }
  return {
    id: row.id,
    simplified: row.simplified,
    traditional: row.traditional,
    // The lists write dictionary tones (yī dìng); cards show what learners hear (yí dìng).
    pinyin: withToneSandhi(row.simplified, row.pinyin),
    meaning: row.meaning,
    level: row.level as HskLevel,
    characters: row.characters as string[],
    topicIds: row.topicIds as string[],
    sourceId: row.sourceId,
    ...(relations ? { relations } : {}),
  };
};

const parseList = (value: unknown, level: HskLevel): CatalogEntry[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`Lista vacía de HSK ${level}.`);
  const entries = value.map((raw) => parseEntry(raw));
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

/** Words the content editor files outside the HSK lists. They arrive with app updates and form the «Extra» list. */
export const extraVocabulary: VocabularyEntry[] = (Array.isArray(extra) ? extra : []).map((raw) => {
  const { level: _level, ...entry } = parseEntry(raw, true);
  return entry;
});

export const EXTRA_SOURCE = 'curated-extra';
/** True for a word of the Extra list. */
export const isExtraWord = (word: VocabularyEntry): boolean => !word.level;

/** Every word the app knows: HSK 1 to 6, then Extra. All of it comes from the content editor's releases. */
const everyWord: VocabularyEntry[] = [...vocabulary, ...extraVocabulary];
const wordsById = new Map(everyWord.map((word) => [word.id, word]));

export const allWords = (): VocabularyEntry[] => everyWord;

export const findWord = (id: string): VocabularyEntry | undefined => wordsById.get(id);

/**
 * Characters of Extra words in these topics that are not a one-character word in `words`,
 * so Temas teaches the pieces of words outside HSK too.
 */
export const charactersOfExtraTopicWords = (topicIds: readonly string[], words: readonly VocabularyEntry[]): string[] => {
  if (topicIds.length === 0) return [];
  const asWord = new Set(words.map((word) => word.simplified));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (!isExtraWord(word) || !topicIds.some((id) => word.topicIds.includes(id))) continue;
    for (const char of word.characters) {
      if (seen.has(char) || asWord.has(char)) continue;
      seen.add(char);
      out.push(char);
    }
  }
  return out;
};

/** Word counts in the original HSK 2.0 source, before editorial additions and level changes. */
export const officialCounts: Record<HskLevel, number> = { 1: 150, 2: 147, 3: 298, 4: 598, 5: 1298, 6: 2500 };

export const vocabularyCoverage = {
  edition: 'HSK 2.0',
  levels: [1, 2, 3, 4, 5, 6] as const satisfies readonly HskLevel[],
  complete: true,
  description: 'Vocabulario HSK 2.0 completo, con ajustes editoriales por nivel',
  // Read from the lists, since the content editor can file new words under a level (HSK 1 has 你好 on top of the 150).
  counts: Object.fromEntries(vocabularyLevels.map((level) => [level, vocabularyByLevel[level].length])) as Record<HskLevel, number>,
};
