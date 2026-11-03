import { createStore, produce } from 'solid-js/store';
import { createSignal } from 'solid-js';
import { topics } from '../data/topics';
import { vocabulary, type CatalogEntry, type VocabularyEntry } from '../data/vocabulary';
import { isRecord, isString } from '../utils/parse';
import { KEYS } from '../persistence/keys';
import { storage } from '../persistence/keyValue';
import { markTones, syllableKey, withToneSandhi, wordId } from '../utils/pinyin';

const TOPIC_IDS = new Set(topics.map((topic) => topic.id));

/** What the learner types. `pinyin` has dictionary tones, one syllable per hanzi. */
export interface MyWordInput {
  simplified: string;
  pinyin: string;
  meaning: string;
  traditional?: string;
  /** Temas where this own word should appear. Catalog words keep theirs until corrected. */
  topicIds?: string[];
}

/**
 * The "Mis palabras" list. `ids` is the list, in the order words were added.
 * A catalog word listed as-is is only referenced. A changed reading or meaning lives in `own`
 * under the catalog id (a correction), so progress stays with that word.
 */
export interface MyWordsData {
  ids: string[];
  own: Record<string, Required<MyWordInput>>;
}

const HAN = /^\p{Script=Han}+$/u;
const UNSAFE = ['__proto__', 'constructor', 'prototype'];

const catalogById = new Map<string, CatalogEntry>(vocabulary.map((word) => [word.id, word]));

const sameTopics = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * True when the typed fields match the catalog row, so listing it needs no `own` copy.
 * Empty topics mean “keep the catalog’s”; any other set is a correction.
 */
export const sameAsCatalog = (catalog: CatalogEntry, word: Required<MyWordInput>): boolean =>
  word.simplified === catalog.simplified
  && word.traditional === catalog.traditional
  && word.meaning === catalog.meaning
  && wordId(word.simplified, word.pinyin) === catalog.id
  && (word.topicIds.length === 0 || sameTopics(word.topicIds, catalog.topicIds));

const toEntry = (id: string, word: Required<MyWordInput>, catalog?: CatalogEntry): VocabularyEntry => ({
  id,
  simplified: word.simplified,
  traditional: word.traditional,
  // Typed with dictionary tones, shown as heard, the same as the catalog.
  pinyin: withToneSandhi(word.simplified, word.pinyin),
  meaning: word.meaning,
  characters: [...word.simplified],
  topicIds: word.topicIds,
  level: catalog?.level,
  sourceId: catalog ? catalog.sourceId : 'mine',
});

/** Resolve an id to what the app should show: a correction, then the catalog, then a pure own word. */
const resolve = (id: string): VocabularyEntry | undefined => {
  const own = store.own[id];
  const catalog = catalogById.get(id);
  if (own) return toEntry(id, own, catalog);
  return catalog;
};

/** Known topic ids only, in the order the learner tapped them, without duplicates. */
export const normalizeTopicIds = (ids: readonly string[] | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (!TOPIC_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

/** Checks and tidies a word as typed. Throws a message for the form. */
export const normalizeMyWord = (input: MyWordInput): Required<MyWordInput> => {
  const simplified = input.simplified.replace(/\s+/g, '');
  const traditional = (input.traditional ?? '').replace(/\s+/g, '') || simplified;
  const pinyin = markTones(input.pinyin);
  const meaning = input.meaning.trim();
  const topicIds = normalizeTopicIds(input.topicIds);
  if (!HAN.test(simplified)) throw new Error('Escribe la palabra en caracteres chinos.');
  if ([...traditional].length !== [...simplified].length || !HAN.test(traditional)) throw new Error('La forma tradicional debe tener los mismos caracteres.');
  const syllables = pinyin ? pinyin.split(' ') : [];
  if (syllables.length !== [...simplified].length) throw new Error('Escribe una sílaba de pinyin por carácter, separadas por espacios.');
  if (syllables.some((syllable) => !syllableKey(syllable) || /[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹ]/.test(syllable))) throw new Error('El pinyin tiene letras que no se reconocen.');
  if (!meaning) throw new Error('Escribe el significado.');
  return { simplified, traditional, pinyin, meaning, topicIds };
};

/** Form seed from a catalog or own word (shown pinyin is fine; normalize turns it back to marks). */
export const inputFromWord = (word: VocabularyEntry): MyWordInput => {
  const own = store.own[word.id];
  return {
    simplified: word.simplified,
    traditional: word.traditional,
    pinyin: own?.pinyin ?? word.pinyin,
    meaning: own?.meaning ?? word.meaning,
    topicIds: [...(own?.topicIds ?? word.topicIds)],
  };
};

/** `strict`: a backup is all or nothing; saved data drops a bad word and keeps the rest. */
const parseData = (value: unknown, strict: boolean): MyWordsData => {
  if (!isRecord(value) || !Array.isArray(value.ids) || !value.ids.every(isString) || !isRecord(value.own)) {
    throw new Error('La lista «Mis palabras» no es válida.');
  }
  const own: MyWordsData['own'] = {};
  for (const [id, raw] of Object.entries(value.own)) {
    try {
      if (UNSAFE.includes(id) || !isRecord(raw) || !isString(raw.simplified) || !isString(raw.pinyin) || !isString(raw.meaning)) {
        throw new Error('La lista «Mis palabras» no es válida.');
      }
      const topicIds = Array.isArray(raw.topicIds) && raw.topicIds.every(isString) ? raw.topicIds : [];
      // The id is kept as saved: fixing a typo later must not cost the word its progress.
      own[id] = normalizeMyWord({
        simplified: raw.simplified,
        pinyin: raw.pinyin,
        meaning: raw.meaning,
        traditional: isString(raw.traditional) ? raw.traditional : undefined,
        topicIds,
      });
    } catch (error) {
      if (strict) throw error;
    }
  }
  const ids = [...new Set(value.ids)].filter((id) => catalogById.has(id) || id in own);
  return { ids, own };
};

const load = (): MyWordsData => {
  try {
    const raw = storage.read(KEYS.myWords);
    return raw ? parseData(JSON.parse(raw), false) : { ids: [], own: {} };
  } catch {
    return { ids: [], own: {} };
  }
};

const [store, setStore] = createStore<MyWordsData>(load());

const [storageError, setStorageError] = createSignal(false);
const save = () => {
  try {
    storage.write(KEYS.myWords, JSON.stringify({ ids: store.ids, own: store.own }));
    setStorageError(false);
  } catch {
    setStorageError(true);
  }
};

export const myWordsStore = {
  storageError,
  retrySave: save,
  get ids(): readonly string[] {
    return store.ids;
  },

  has(id: string): boolean {
    return store.ids.includes(id);
  },

  /** True when this catalog id has a learner override in `own`. Reads `own[id]` so the UI tracks it. */
  isCorrection(id: string): boolean {
    return !!catalogById.get(id) && store.own[id] !== undefined;
  },

  /** The list's words, catalog words included, in the order they were added. */
  words(): VocabularyEntry[] {
    return store.ids.flatMap((id) => {
      const word = resolve(id);
      return word ? [word] : [];
    });
  },

  /**
   * Rows stored in `own`: words outside HSK, and corrections of catalog words.
   * Catalog references with no override are not here.
   */
  ownWords(): VocabularyEntry[] {
    return Object.entries(store.own).map(([id, word]) => toEntry(id, word, catalogById.get(id)));
  },

  /** Dictionary fields of an own or corrected word. Undefined for an untouched catalog reference. */
  own(id: string): Required<MyWordInput> | undefined {
    const word = store.own[id];
    return word ? { ...word, topicIds: [...word.topicIds] } : undefined;
  },

  catalog(id: string): CatalogEntry | undefined {
    return catalogById.get(id);
  },

  /**
   * Adds a word. Same hanzi and reading as HSK with the same fields → list reference only.
   * Different meaning, pinyin or topics → stored as a correction under the catalog id.
   * `catalogId` keeps progress when the learner corrects a specific HSK row they picked.
   */
  add(input: MyWordInput, catalogId?: string): {
    word: VocabularyEntry;
    inCatalog: boolean;
    alreadyListed: boolean;
    corrected: boolean;
  } {
    const word = normalizeMyWord(input);
    const derived = wordId(word.simplified, word.pinyin);
    // An own word whose reading was fixed keeps its first id; adding it again must find that one.
    const existingOwn = Object.keys(store.own).find((key) => wordId(store.own[key].simplified, store.own[key].pinyin) === derived);
    const catalog = (catalogId ? catalogById.get(catalogId) : undefined)
      ?? catalogById.get(derived)
      ?? (existingOwn ? catalogById.get(existingOwn) : undefined);
    const id = catalog?.id ?? existingOwn ?? derived;
    if (catalogId && catalog && catalog.simplified !== word.simplified) {
      throw new Error('La corrección debe ser de la misma palabra.');
    }
    const alreadyListed = store.ids.includes(id);
    const matches = catalog ? sameAsCatalog(catalog, word) : false;
    const corrected = !!catalog && !matches;
    setStore(produce((draft) => {
      if (matches) delete draft.own[id];
      else draft.own[id] = word;
      if (!alreadyListed) draft.ids.push(id);
    }));
    save();
    return { word: resolve(id)!, inCatalog: !!catalog, alreadyListed, corrected };
  },

  /** Adds a catalog word by id, untouched. Its shown pinyin carries tone sandhi, so it cannot go through `add`. */
  addCatalog(id: string): { word: VocabularyEntry; inCatalog: boolean; alreadyListed: boolean; corrected: boolean } {
    const word = catalogById.get(id);
    if (!word) throw new Error('Esa palabra no está en HSK.');
    const alreadyListed = store.ids.includes(id);
    if (!alreadyListed) {
      setStore('ids', (ids) => [...ids, id]);
      save();
    }
    return { word: resolve(id)!, inCatalog: true, alreadyListed, corrected: id in store.own };
  },

  /**
   * Fixes the reading or meaning. Id (and progress) stay. A listed catalog word becomes a
   * correction in `own`; clearing the override when fields match the catalog again.
   */
  update(id: string, input: MyWordInput) {
    if (!store.ids.includes(id) && !(id in store.own)) return;
    const word = normalizeMyWord(input);
    const catalog = catalogById.get(id);
    if (catalog && catalog.simplified !== word.simplified) {
      throw new Error('La corrección debe ser de la misma palabra.');
    }
    setStore(produce((draft) => {
      if (!draft.ids.includes(id)) draft.ids.push(id);
      if (catalog && sameAsCatalog(catalog, word)) delete draft.own[id];
      else draft.own[id] = word;
    }));
    save();
  },

  /** Takes a word off the list. Its progress stays, in case it comes back. */
  remove(id: string) {
    setStore(produce((draft) => {
      draft.ids = draft.ids.filter((item) => item !== id);
      delete draft.own[id];
    }));
    save();
  },

  exportData(): MyWordsData {
    return { ids: [...store.ids], own: { ...store.own } };
  },

  /** A backup's list, checked. Throws if any of it is invalid. */
  checkData(value: unknown): MyWordsData {
    return parseData(value, true);
  },

  /** Replaces the list with a backup's. Throws before changing anything if the data is invalid. */
  importData(value: unknown) {
    const data = parseData(value, true);
    storage.write(KEYS.myWords, JSON.stringify(data));
    setStore({ ids: data.ids, own: data.own });
    setStorageError(false);
  },

  reset() {
    setStore({ ids: [], own: {} });
    try { storage.remove(KEYS.myWords); } catch { /* Storage may be unavailable. */ }
  },
};

/** Every word the app knows: HSK (with corrections applied) plus words only the learner added. */
export const allWords = (): VocabularyEntry[] => {
  const extras = Object.entries(store.own)
    .filter(([id]) => !catalogById.has(id))
    .map(([id, word]) => toEntry(id, word));
  return [
    ...vocabulary.map((word) => (word.id in store.own ? resolve(word.id)! : word)),
    ...extras,
  ];
};

export const findWord = (id: string): VocabularyEntry | undefined => resolve(id);

/**
 * Characters of the learner's own words that sit in these topics.
 * `words` is usually the topic's listed rows, so a search and a browse share the same filter.
 * Skips glyphs that are already a one-character word in that list.
 */
export const charactersOfOwnTopicWords = (
  topicIds: readonly string[],
  words: readonly VocabularyEntry[],
): string[] => {
  if (topicIds.length === 0) return [];
  const asWord = new Set(words.map((word) => word.simplified));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (word.sourceId !== 'mine') continue;
    if (!topicIds.some((id) => word.topicIds.includes(id))) continue;
    for (const char of word.characters) {
      if (seen.has(char) || asWord.has(char)) continue;
      seen.add(char);
      out.push(char);
    }
  }
  return out;
};
