import { createStore, reconcile, unwrap } from 'solid-js/store';
import { createSignal } from 'solid-js';
import { topics } from '../data/topics';
import { vocabulary, type CatalogEntry, type VocabularyEntry } from '../data/vocabulary';
import { isRecord, isString } from '../utils/parse';
import { KEYS } from '../persistence/keys';
import { deviceIdIn } from '../persistence/deviceId';
import { storage, type KeyValueStore } from '../persistence/keyValue';
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
 * One word of "Mis palabras". A catalog word listed as-is is only referenced. A changed reading or
 * meaning lives in `own` under the catalog id (a correction), so progress stays with that word.
 * Taking a word off the list leaves a tombstone (`removedAt`), so merging two copies of the list
 * can tell a removal apart from a word the other copy never had.
 */
export interface MyWordRecord {
  /** Epoch ms when the word was put on the list. The list shows words in this order. */
  addedAt: number;
  removedAt: number | null;
  own?: Required<MyWordInput>;
  /** Epoch ms of the last write. Of two copies of a record, the later one wins. */
  updatedAt: number;
  deviceId: string;
}

/** The list as saved and in a backup: one record per word, by id. */
export interface MyWordsData {
  version: 2;
  words: Record<string, MyWordRecord>;
}

/** Listed ids, in the order they were added. */
export const listedIds = (words: Record<string, MyWordRecord>): string[] =>
  Object.keys(words)
    .filter((id) => words[id].removedAt === null)
    .sort((a, b) => words[a].addedAt - words[b].addedAt || (a < b ? -1 : a > b ? 1 : 0));

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

const isStamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const invalidList = () => new Error('La lista «Mis palabras» no es válida.');

const parseRecord = (id: string, raw: unknown): MyWordRecord => {
  if (UNSAFE.includes(id) || !isRecord(raw) || !isStamp(raw.addedAt) || !isStamp(raw.updatedAt) || !isString(raw.deviceId)
    || (raw.removedAt !== null && !isStamp(raw.removedAt))) {
    throw invalidList();
  }
  const record: MyWordRecord = { addedAt: raw.addedAt, removedAt: raw.removedAt, updatedAt: raw.updatedAt, deviceId: raw.deviceId };
  if (raw.own !== undefined) {
    const own = raw.own;
    if (!isRecord(own) || !isString(own.simplified) || !isString(own.pinyin) || !isString(own.meaning)) throw invalidList();
    const topicIds = Array.isArray(own.topicIds) && own.topicIds.every(isString) ? own.topicIds : [];
    // The id is kept as saved: fixing a typo later must not cost the word its progress.
    record.own = normalizeMyWord({
      simplified: own.simplified,
      pinyin: own.pinyin,
      meaning: own.meaning,
      traditional: isString(own.traditional) ? own.traditional : undefined,
      topicIds,
    });
  }
  // A listed word must resolve to something: the catalog, or its own fields.
  if (record.removedAt === null && !record.own && !catalogById.has(id)) throw invalidList();
  return record;
};

/** `strict`: a backup is all or nothing; saved data drops a bad word and keeps the rest. */
const parseData = (value: unknown, strict: boolean): MyWordsData => {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.words)) throw invalidList();
  const words: MyWordsData['words'] = {};
  for (const [id, raw] of Object.entries(value.words)) {
    try {
      words[id] = parseRecord(id, raw);
    } catch (error) {
      if (strict) throw error;
    }
  }
  return { version: 2, words };
};

/**
 * The Mis palabras store over `repo`. Tests pass a repo of their own to start from an empty list,
 * and a `deviceId` to act as another device.
 */
export const createMyWordsStore = (repo: KeyValueStore, options: { deviceId?: string } = {}) => {
  const ownOf = (id: string): Required<MyWordInput> | undefined => store.words[id]?.own;

  /** Resolve an id to what the app should show: a correction, then the catalog, then a pure own word. */
  const resolve = (id: string): VocabularyEntry | undefined => {
    const own = ownOf(id);
    const catalog = catalogById.get(id);
    if (own) return toEntry(id, own, catalog);
    return catalog;
  };

  const empty = (): MyWordsData => ({ version: 2, words: {} });

  const load = (): MyWordsData => {
    try {
      const raw = repo.read(KEYS.myWords);
      return raw ? parseData(JSON.parse(raw), false) : empty();
    } catch {
      return empty();
    }
  };

  const [store, setStore] = createStore<MyWordsData>(load());
  const deviceId = options.deviceId ?? deviceIdIn(repo);

  // Strictly increasing, so words added in the same millisecond keep the order they were added in.
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return lastStamp;
  };

  const isListed = (id: string) => store.words[id]?.removedAt === null;

  /** Writes one word's record. `own` undefined drops the override; `listed` false leaves a tombstone. */
  const writeWord = (id: string, own: Required<MyWordInput> | undefined, listed = true) => {
    const now = stamp();
    const before = store.words[id];
    const addedAt = before && before.removedAt === null ? before.addedAt : now;
    const record: MyWordRecord = { addedAt, removedAt: listed ? null : now, updatedAt: now, deviceId, ...(own && listed ? { own } : {}) };
    setStore('words', id, reconcile(record));
  };

  const [storageError, setStorageError] = createSignal(false);
  const save = () => {
    try {
      repo.write(KEYS.myWords, JSON.stringify(unwrap(store)));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };

  return {
    storageError,
    retrySave: save,
    get ids(): readonly string[] {
      return listedIds(store.words);
    },

    has(id: string): boolean {
      return isListed(id);
    },

    /** True when this catalog id has a learner override in `own`. Reads the record so the UI tracks it. */
    isCorrection(id: string): boolean {
      return !!catalogById.get(id) && ownOf(id) !== undefined;
    },

    /** The list's words, catalog words included, in the order they were added. */
    words(): VocabularyEntry[] {
      return listedIds(store.words).flatMap((id) => {
        const word = resolve(id);
        return word ? [word] : [];
      });
    },

    /**
     * Words with fields of their own: words outside HSK, and corrections of catalog words.
     * Catalog references with no override are not here.
     */
    ownWords(): VocabularyEntry[] {
      return listedIds(store.words).flatMap((id) => {
        const own = ownOf(id);
        return own ? [toEntry(id, own, catalogById.get(id))] : [];
      });
    },

    /** Dictionary fields of an own or corrected word. Undefined for an untouched catalog reference. */
    own(id: string): Required<MyWordInput> | undefined {
      const word = ownOf(id);
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
      const existingOwn = listedIds(store.words).find((key) => {
        const own = ownOf(key);
        return !!own && wordId(own.simplified, own.pinyin) === derived;
      });
      const catalog = (catalogId ? catalogById.get(catalogId) : undefined)
        ?? catalogById.get(derived)
        ?? (existingOwn ? catalogById.get(existingOwn) : undefined);
      const id = catalog?.id ?? existingOwn ?? derived;
      if (catalogId && catalog && catalog.simplified !== word.simplified) {
        throw new Error('La corrección debe ser de la misma palabra.');
      }
      const alreadyListed = isListed(id);
      const matches = catalog ? sameAsCatalog(catalog, word) : false;
      const corrected = !!catalog && !matches;
      writeWord(id, matches ? undefined : word);
      save();
      return { word: resolve(id)!, inCatalog: !!catalog, alreadyListed, corrected };
    },

    /** Adds a catalog word by id, untouched. Its shown pinyin carries tone sandhi, so it cannot go through `add`. */
    addCatalog(id: string): { word: VocabularyEntry; inCatalog: boolean; alreadyListed: boolean; corrected: boolean } {
      const word = catalogById.get(id);
      if (!word) throw new Error('Esa palabra no está en HSK.');
      const alreadyListed = isListed(id);
      if (!alreadyListed) {
        writeWord(id, undefined);
        save();
      }
      return { word: resolve(id)!, inCatalog: true, alreadyListed, corrected: ownOf(id) !== undefined };
    },

    /**
     * Fixes the reading or meaning. Id (and progress) stay. A listed catalog word becomes a
     * correction in `own`; clearing the override when fields match the catalog again.
     */
    update(id: string, input: MyWordInput) {
      if (!isListed(id)) return;
      const word = normalizeMyWord(input);
      const catalog = catalogById.get(id);
      if (catalog && catalog.simplified !== word.simplified) {
        throw new Error('La corrección debe ser de la misma palabra.');
      }
      writeWord(id, catalog && sameAsCatalog(catalog, word) ? undefined : word);
      save();
    },

    /** Takes a word off the list. Its progress stays, in case it comes back. */
    remove(id: string) {
      if (!isListed(id)) return;
      writeWord(id, undefined, false);
      save();
    },

    /** Every record, tombstones included, so a merge elsewhere learns about removals. */
    exportData(): MyWordsData {
      return JSON.parse(JSON.stringify(unwrap(store))) as MyWordsData;
    },

    /** A backup's list, checked. Throws if any of it is invalid. */
    checkData(value: unknown): MyWordsData {
      return parseData(value, true);
    },

    /** Replaces the list with a backup's. Throws before changing anything if the data is invalid. */
    importData(value: unknown) {
      const data = parseData(value, true);
      repo.write(KEYS.myWords, JSON.stringify(data));
      setStore(reconcile(data));
      setStorageError(false);
    },

    reset() {
      setStore(reconcile(empty()));
      try { repo.remove(KEYS.myWords); } catch { /* Storage may be unavailable. */ }
    },

    /** Form seed from a catalog or own word (shown pinyin is fine; normalize turns it back to marks). */
    inputFromWord(word: VocabularyEntry): MyWordInput {
      const own = ownOf(word.id);
      return {
        simplified: word.simplified,
        traditional: word.traditional,
        pinyin: own?.pinyin ?? word.pinyin,
        meaning: own?.meaning ?? word.meaning,
        topicIds: [...(own?.topicIds ?? word.topicIds)],
      };
    },

    /** Every word the app knows: HSK (with corrections applied) plus words only the learner added. */
    allWords(): VocabularyEntry[] {
      const extras = listedIds(store.words)
        .filter((id) => !catalogById.has(id) && ownOf(id))
        .map((id) => toEntry(id, ownOf(id)!));
      return [
        ...vocabulary.map((word) => (ownOf(word.id) ? resolve(word.id)! : word)),
        ...extras,
      ];
    },

    findWord(id: string): VocabularyEntry | undefined {
      return resolve(id);
    },
  };
};

export const myWordsStore = createMyWordsStore(storage);

export const inputFromWord = (word: VocabularyEntry): MyWordInput => myWordsStore.inputFromWord(word);

export const allWords = (): VocabularyEntry[] => myWordsStore.allWords();

export const findWord = (id: string): VocabularyEntry | undefined => myWordsStore.findWord(id);


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
