import { withToneSandhi } from '@jiayou/chinese';
import { isHskLevel, type HskLevel } from './contracts.ts';
import { isWordRelationKind, type WordRelation } from './relations.ts';
import { parseSenses, type WordSense } from './senses.ts';

export interface VocabularyExample {
  chinese: string;
  spanish: string;
  /** The sentence's reading, words separated by spaces. Older sentences have none. */
  pinyin?: string;
}

/** A sentence with its Chinese and Spanish filled in; pinyin, when present, is text too. */
export const isVocabularyExample = (value: unknown): value is VocabularyExample => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.chinese === 'string' && !!row.chinese.trim() && typeof row.spanish === 'string' && !!row.spanish.trim() &&
    (row.pinyin === undefined || (typeof row.pinyin === 'string' && !!row.pinyin.trim()));
};

/**
 * The sentences a word shows, in order. `examples` is the list since content version 4 and wins
 * when present, even empty; otherwise the single legacy `example`, or the sidecar sentence `legacy`.
 */
export const wordExamples = (word: Pick<VocabularyEntry, 'examples' | 'example'>, legacy?: VocabularyExample): VocabularyExample[] => {
  if (word.examples) return word.examples;
  if (word.example === null) return [];
  const one = word.example ?? legacy;
  return one ? [one] : [];
};

export interface VocabularyEntry {
  id: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  /** Every use of the word, in order. The first one is what cards and lists show. */
  senses: WordSense[];
  /** The HSK level of a catalog word. Words the learner adds have none. */
  level?: HskLevel;
  characters: string[];
  topicIds: string[];
  sourceId: string;
  /** Editorial links to other catalog words (synonyms, antonyms, …). Omitted when empty. */
  relations?: WordRelation[];
  /** Null removes a legacy example; undefined keeps the example from the sidecar. */
  example?: VocabularyExample | null;
  /** Sentences that use the word, each with its translation. Read through `wordExamples`. */
  examples?: VocabularyExample[];
}

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

/** One row of a word list, checked. `allowExtra` accepts a word without an HSK level. */
export const parseVocabularyEntry = (raw: unknown, allowExtra = false): CatalogEntry => {
  if (!raw || typeof raw !== 'object') throw new Error('Entrada de vocabulario inválida.');
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) throw new Error('Palabra sin id.');
  if (typeof row.simplified !== 'string' || !row.simplified) throw new Error('Palabra sin simplified.');
  if (typeof row.traditional !== 'string' || !row.traditional) throw new Error(`Sin traditional: ${row.simplified}`);
  if (typeof row.pinyin !== 'string' || !row.pinyin) throw new Error(`Sin pinyin: ${row.simplified}`);
  if (!isHskLevel(row.level) && !(allowExtra && row.level === undefined)) throw new Error(`Nivel inválido: ${row.simplified}`);
  if (!Array.isArray(row.characters) || row.characters.some((c) => typeof c !== 'string')) {
    throw new Error(`Caracteres inválidos: ${row.simplified}`);
  }
  if (!Array.isArray(row.topicIds) || row.topicIds.some((id) => typeof id !== 'string')) {
    throw new Error(`Temas inválidos: ${row.simplified}`);
  }
  if (typeof row.sourceId !== 'string' || !row.sourceId) throw new Error(`Sin sourceId: ${row.simplified}`);
  let relations: WordRelation[] | undefined;
  if (row.example !== undefined && row.example !== null && (typeof row.example !== 'object' ||
    typeof (row.example as VocabularyExample).chinese !== 'string' || !(row.example as VocabularyExample).chinese.trim() ||
    typeof (row.example as VocabularyExample).spanish !== 'string' || !(row.example as VocabularyExample).spanish.trim())) {
    throw new Error(`Frase inválida: ${row.simplified}`);
  }
  if (row.examples !== undefined && (!Array.isArray(row.examples) || !row.examples.every(isVocabularyExample))) {
    throw new Error(`Frases inválidas: ${row.simplified}`);
  }
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
    senses: parseSenses(row.senses, row.simplified),
    level: row.level as HskLevel,
    characters: row.characters as string[],
    topicIds: row.topicIds as string[],
    sourceId: row.sourceId,
    ...(relations ? { relations } : {}),
    ...(row.example !== undefined ? { example: row.example as VocabularyExample | null } : {}),
    ...(row.examples !== undefined ? { examples: row.examples as VocabularyExample[] } : {}),
  };
};

/** A level's word list, checked: every row parses and belongs to `level`. */
export const parseVocabularyList = (value: unknown, level: HskLevel): CatalogEntry[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`Lista vacía de HSK ${level}.`);
  const entries = value.map((raw) => parseVocabularyEntry(raw));
  if (entries.some((entry) => entry.level !== level)) {
    throw new Error(`La lista de HSK ${level} mezcla otros niveles.`);
  }
  return entries;
};
