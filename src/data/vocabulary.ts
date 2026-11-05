import { createSignal } from 'solid-js';
import type { HskLevel } from '../types';
import { withToneSandhi } from '../utils/pinyin';
import type { WordRelation } from './wordRelations';
import { isWordRelationKind } from './wordRelations';
import { parseSenses, type WordSense } from './wordSenses';
// Only HSK 1 ships inside the app. HSK 2 to 6 arrive with their level's pack (packs/hskN/words.json)
// when the learner activates the list, through installLevelWords.
import hsk1 from './vocabulary/hsk1.json';
import extra from './vocabulary/extra.json';
import examples from './vocabulary/examples.json';

export interface VocabularyExample {
  chinese: string;
  spanish: string;
}

export const vocabularyExample = (simplified: string, proposed?: VocabularyExample | null): VocabularyExample | undefined =>
  proposed === undefined ? (examples as Record<string, VocabularyExample>)[simplified] : proposed ?? undefined;

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
}

export type { WordRelation, WordRelationKind } from './wordRelations';
export type { WordPos, WordSense } from './wordSenses';

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

export const vocabularyLevels: HskLevel[] = [1, 2, 3, 4, 5, 6];

/** The HSK level whose words ship inside the app. The others download with their pack. */
export const BUNDLED_WORD_LEVEL: HskLevel = 1;

/** Words the content editor files outside the HSK lists. They arrive with app updates and form the «Extra» list. */
export const extraVocabulary: VocabularyEntry[] = (Array.isArray(extra) ? extra : []).map((raw) => {
  const { level: _level, ...entry } = parseEntry(raw, true);
  return entry;
});

export const EXTRA_SOURCE = 'curated-extra';
/** True for a word of the Extra list. */
export const isExtraWord = (word: VocabularyEntry): boolean => !word.level;

/** The words of each level on the device. Reading it inside a memo re-runs the memo when a level arrives or leaves. */
const [loadedLevels, setLoadedLevels] = createSignal<Partial<Record<HskLevel, CatalogEntry[]>>>({
  [BUNDLED_WORD_LEVEL]: parseList(hsk1, BUNDLED_WORD_LEVEL),
});

let index: { every: VocabularyEntry[]; byId: Map<string, VocabularyEntry> } | null = null;
const wordIndex = () => {
  const levels = loadedLevels();
  if (!index) {
    const every = [...vocabularyLevels.flatMap((level) => levels[level] ?? []), ...extraVocabulary];
    index = { every, byId: new Map(every.map((word) => [word.id, word])) };
  }
  return index;
};

/** Parse a level's word list and make it available. Throws if the list is not that level's. */
export const installLevelWords = (level: HskLevel, raw: unknown) => {
  const words = parseList(raw, level);
  index = null;
  setLoadedLevels((current) => ({ ...current, [level]: words }));
};

/** Forget a downloaded level. HSK 1 always stays. */
export const removeLevelWords = (level: HskLevel) => {
  if (level === BUNDLED_WORD_LEVEL || !loadedLevels()[level]) return;
  index = null;
  setLoadedLevels((current) => {
    const next = { ...current };
    delete next[level];
    return next;
  });
};

export const hasLevelWords = (level: HskLevel): boolean => !!loadedLevels()[level];

/** The words of `level` on the device, or none until its pack is downloaded. */
export const levelWords = (level: HskLevel): CatalogEntry[] => loadedLevels()[level] ?? [];

/** Every HSK word on the device, HSK 1 first. Not the learner's selection: see vocabularyStore.getSelectedWords. */
export const catalogWords = (): CatalogEntry[] => vocabularyLevels.flatMap(levelWords);

/** Every word on the device: the HSK levels downloaded, then Extra. */
export const allWords = (): VocabularyEntry[] => wordIndex().every;

/** A word on the device by id. Words of a level that is not downloaded are not found. */
export const findWord = (id: string): VocabularyEntry | undefined => wordIndex().byId.get(id);

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

/** How many words a level has, whether or not it is downloaded. */
export function wordCount(level: HskLevel): number {
  return typeof __WORD_COUNTS__ === 'object' ? __WORD_COUNTS__[level] ?? 0 : levelWords(level).length;
}

/** Word counts in the original HSK 2.0 source, before editorial additions and level changes. */
export const officialCounts: Record<HskLevel, number> = { 1: 150, 2: 147, 3: 298, 4: 598, 5: 1298, 6: 2500 };

export const vocabularyCoverage = {
  edition: 'HSK 2.0',
  levels: [1, 2, 3, 4, 5, 6] as const satisfies readonly HskLevel[],
  complete: true,
  description: 'Vocabulario HSK 2.0 completo, con ajustes editoriales por nivel',
  // Counted from the lists at build time (vite.config.ts), since the content editor can file new words
  // under a level (HSK 1 has 你好 on top of the 150) and most lists are not on the device.
  counts: Object.fromEntries(vocabularyLevels.map((level) => [level, wordCount(level)])) as Record<HskLevel, number>,
};
